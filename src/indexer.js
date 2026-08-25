/**
 * Batch indexer engine integrating with codebase-memory-mcp in JavaScript.
 *
 * Automates running `codebase-memory-mcp cli index_repository` and `delete_project`
 * across all repositories defined in a project registry.
 */

import { exec, execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { ProjectRegistry, loadRegistry, listAvailableProjects } from "./registry.js";

const MISSING_CBM_HELP =
  "codebase-memory-mcp executable not found on PATH or standard install directories. " +
  "Please install it globally using: `npm install -g codebase-memory-mcp@latest` or run `install.ps1` on Windows.";

function findExecutable(name) {
  const isWindows = process.platform === "win32";
  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);

  // Common additional install locations
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    pathDirs.push(
      path.join(localAppData, "Programs", "codebase-memory-mcp"),
      path.join(appData, "npm")
    );
  } else {
    pathDirs.push(
      path.join(os.homedir(), ".local", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin"
    );
  }

  const extensions = isWindows ? [".cmd", ".exe", ".bat", ".ps1", ""] : [""];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, name + ext);
      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) return fullPath;
        } catch {}
      }
    }
  }
  return null;
}

export function findCodebaseMemoryExecutable() {
  const found = findExecutable("codebase-memory-mcp");
  if (found) return found;

  // Fallback to command name for environment PATH lookup
  return process.platform === "win32" ? "codebase-memory-mcp.cmd" : "codebase-memory-mcp";
}

export function checkCodebaseMemoryStatus() {
  const found = findExecutable("codebase-memory-mcp");
  const fallbackCmd = process.platform === "win32" ? "codebase-memory-mcp.cmd" : "codebase-memory-mcp";
  const isAvailable = Boolean(found);

  return {
    available: isAvailable,
    executable: found || fallbackCmd,
    isExplicitPath: Boolean(found),
    installCommand: "npm install -g codebase-memory-mcp@latest",
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const quotedCmd =
      isWindows && !command.startsWith('"') && command.includes(" ")
        ? `"${command}"`
        : command;
    const fullCmd = isWindows ? `${quotedCmd} ${args.join(" ")}` : command;

    const callback = (error, stdout, stderr) => {
      resolve({
        code: error ? error.code || 1 : 0,
        stdout: stdout || "",
        stderr: stderr || "",
        error: error ? error.message : null,
      });
    };

    let child;
    if (isWindows) {
      child = exec(
        fullCmd,
        {
          timeout: options.timeout || 600000,
          maxBuffer: 10 * 1024 * 1024,
          ...options,
        },
        callback
      );
    } else {
      child = execFile(
        command,
        args,
        {
          timeout: options.timeout || 600000,
          maxBuffer: 10 * 1024 * 1024,
          ...options,
        },
        callback
      );
    }

    if (child && child.stdin) {
      if (options.input) {
        child.stdin.write(options.input);
      }
      child.stdin.end();
    }
  });
}

/**
 * Read and parse local repository .codebase-memory/artifact.json if it exists.
 */
export function readLocalRepoArtifact(repoPath) {
  if (!repoPath) return null;
  try {
    const resolved = path.resolve(repoPath);
    const artifactPath = path.join(resolved, ".codebase-memory", "artifact.json");
    if (fs.existsSync(artifactPath) && fs.statSync(artifactPath).isFile()) {
      const content = fs.readFileSync(artifactPath, "utf-8");
      const data = JSON.parse(content);
      const stat = fs.statSync(artifactPath);
      return {
        name: data.project || path.basename(resolved),
        project_id: data.project || path.basename(resolved),
        root_path: resolved.replace(/\\/g, "/"),
        is_indexed: true,
        nodes: typeof data.nodes === "number" ? data.nodes : null,
        edges: typeof data.edges === "number" ? data.edges : null,
        commit: data.commit || null,
        indexed_at: data.indexed_at || stat.mtime.toISOString(),
        artifact_path: artifactPath.replace(/\\/g, "/"),
        source: "local_artifact",
      };
    }
  } catch {}
  return null;
}

/**
 * Scan global codebase-memory-mcp cache directory (~/.cache/codebase-memory-mcp) for indexed .db files.
 */
export function scanGlobalCbmCache() {
  const results = [];
  const candidateDirs = [
    path.join(os.homedir(), ".cache", "codebase-memory-mcp"),
    path.join(os.homedir(), ".codebase-memory"),
  ];

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidateDirs.push(
      path.join(process.env.LOCALAPPDATA, "codebase-memory-mcp"),
      path.join(process.env.LOCALAPPDATA, "cache", "codebase-memory-mcp")
    );
  }

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".db") && !entry.name.startsWith("_")) {
          const dbPath = path.join(dir, entry.name);
          const projectName = entry.name.slice(0, -3); // remove .db
          try {
            const stat = fs.statSync(dbPath);
            results.push({
              name: projectName,
              project_id: projectName,
              db_path: dbPath.replace(/\\/g, "/"),
              size_bytes: stat.size,
              last_modified: stat.mtime.toISOString(),
              is_indexed: true,
              source: "global_cache",
            });
          } catch {}
        }
      }
    } catch {}
  }

  return results;
}

export async function listIndexedProjects(targetRegistryOrWorkspace = null) {
  const projectMap = new Map();

  function mergeEntry(key, newEntry) {
    if (!key) return;
    const k = key.toLowerCase();
    const existing = projectMap.get(k) || {};
    const merged = {
      ...existing,
      ...newEntry,
      nodes:
        typeof newEntry.nodes === "number"
          ? newEntry.nodes
          : typeof existing.nodes === "number"
          ? existing.nodes
          : null,
      edges:
        typeof newEntry.edges === "number"
          ? newEntry.edges
          : typeof existing.edges === "number"
          ? existing.edges
          : null,
      commit: newEntry.commit || existing.commit || null,
      indexed_at: newEntry.indexed_at || existing.indexed_at || null,
      artifact_path: newEntry.artifact_path || existing.artifact_path || null,
      db_path: newEntry.db_path || existing.db_path || null,
      is_indexed: true,
    };
    projectMap.set(k, merged);
  }

  // 1. Scan global cache directory first (fast & non-blocking)
  const cached = scanGlobalCbmCache();
  for (const c of cached) {
    mergeEntry(c.project_id, c);
    mergeEntry(c.name, c);
  }

  // 2. Scan known project repositories if available
  try {
    let registryList = [];
    if (targetRegistryOrWorkspace) {
      try {
        const reg = loadRegistry(targetRegistryOrWorkspace);
        registryList.push(reg);
      } catch {}
    }

    const available = listAvailableProjects();
    for (const proj of available) {
      if (proj.registry_path && fs.existsSync(proj.registry_path)) {
        try {
          const reg = loadRegistry(proj.registry_path);
          registryList.push(reg);
        } catch {}
      }
    }

    for (const reg of registryList) {
      const regDir = reg.source_path ? path.dirname(reg.source_path) : process.cwd();
      for (const repo of reg.repos || []) {
        const fullRepoPath = repo.local_path
          ? (path.isAbsolute(repo.local_path) ? repo.local_path : path.resolve(regDir, repo.local_path))
          : null;
        if (fullRepoPath) {
          const art = readLocalRepoArtifact(fullRepoPath);
          if (art) {
            art.repo_name = repo.name;
            const slug = deriveCbmSlug(fullRepoPath);
            mergeEntry(art.project_id, art);
            mergeEntry(repo.name, art);
            mergeEntry(slug, art);
          }
        }
      }
    }
  } catch {}

  // 3. Attempt CLI query with a non-blocking timeout to query active CBM daemon
  const cbmExe = findCodebaseMemoryExecutable();
  if (cbmExe) {
    try {
      const res = await runCommand(cbmExe, ["cli", "--json", "list_projects"], {
        timeout: 30000,
      });
      const parsedProjects = extractProjectsFromCbmOutput(res.stdout, res.stderr);
      for (const p of parsedProjects) {
        const key = (p.name || p.project_id || "").toLowerCase();
        if (key) {
          mergeEntry(key, { ...p, source: "cli" });
        }
      }
    } catch {}
  }

  // Deduplicate results by unique project_id / name
  const seen = new Set();
  const finalResults = [];
  for (const item of projectMap.values()) {
    const id = (item.project_id || item.name || "").toLowerCase();
    if (id && !seen.has(id)) {
      seen.add(id);
      finalResults.push(item);
    }
  }

  return finalResults;
}

/**
 * Extract projects array from codebase-memory-mcp CLI output (supports plain JSON, structuredContent, and MCP text).
 */
export function extractProjectsFromCbmOutput(stdout, stderr) {
  const combined = (stdout || "") + "\n" + (stderr || "");
  const projects = [];

  for (const line of combined.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("{") &&
      (trimmed.includes('"projects"') ||
        trimmed.includes('"structuredContent"') ||
        trimmed.includes('"content"'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed.projects)) {
          projects.push(...parsed.projects);
        }
        if (parsed.structuredContent && Array.isArray(parsed.structuredContent.projects)) {
          projects.push(...parsed.structuredContent.projects);
        }
        if (Array.isArray(parsed.content)) {
          for (const item of parsed.content) {
            if (item && item.type === "text" && item.text) {
              try {
                const subParsed = JSON.parse(item.text);
                if (Array.isArray(subParsed.projects)) {
                  projects.push(...subParsed.projects);
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  if (projects.length === 0) {
    const jsonMatch = combined.match(/\{[\s\S]*"projects"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.projects)) {
          projects.push(...parsed.projects);
        } else if (parsed.structuredContent && Array.isArray(parsed.structuredContent.projects)) {
          projects.push(...parsed.structuredContent.projects);
        }
      } catch {}
    }
  }

  return projects;
}

export function deriveCbmSlug(localPath) {
  return String(localPath || "")
    .trim()
    .replace(/^[/\\]+/, "")
    .replace(/[/\\]+$/, "")
    .replace(/[:/\\]+/g, "-");
}

/**
 * Check if a repository is indexed in local artifact or global CBM cache.
 */
export function getRepoIndexInfo(repoPath, repoName = "", globalCached = null) {
  // 1. Check local artifact.json
  if (repoPath) {
    const localArt = readLocalRepoArtifact(repoPath);
    if (localArt) {
      return {
        is_indexed: true,
        index_nodes: localArt.nodes,
        index_edges: localArt.edges,
        indexed_at: localArt.indexed_at,
        index_project: localArt.project_id,
        source: "local_artifact",
      };
    }
  }

  // 2. Check global cache
  const cacheList = globalCached || scanGlobalCbmCache();
  const slug = repoPath ? deriveCbmSlug(repoPath).toLowerCase() : "";
  const nameLower = (repoName || "").toLowerCase();

  for (const item of cacheList) {
    const itemName = (item.name || item.project_id || "").toLowerCase();
    if ((nameLower && itemName === nameLower) || (slug && itemName === slug)) {
      return {
        is_indexed: true,
        index_nodes: typeof item.nodes === "number" ? item.nodes : null,
        index_edges: typeof item.edges === "number" ? item.edges : null,
        indexed_at: item.indexed_at || item.last_modified || null,
        index_project: item.name || item.project_id,
        source: item.source || "global_cache",
      };
    }
  }

  return {
    is_indexed: false,
    index_nodes: null,
    index_edges: null,
    indexed_at: null,
    index_project: null,
  };
}

export async function deleteIndexedGraph(projectName) {
  const cbmExe = findCodebaseMemoryExecutable();
  if (!cbmExe) {
    return {
      name: projectName,
      status: "error",
      error: MISSING_CBM_HELP,
    };
  }

  try {
    const res = await runCommand(
      cbmExe,
      ["cli", "delete_project", "--project", `"${projectName}"`],
      { timeout: 45000 }
    );
    if (res.code === 0) {
      return {
        name: projectName,
        status: "success",
        output: res.stdout.trim(),
      };
    } else {
      return {
        name: projectName,
        status: "failed",
        error: res.stderr.trim() || res.stdout.trim(),
      };
    }
  } catch (err) {
    return {
      name: projectName,
      status: "error",
      error: err.message,
    };
  }
}

export async function purgeProjectGraphs(registryOrTarget = null) {
  const registry =
    registryOrTarget instanceof ProjectRegistry
      ? registryOrTarget
      : loadRegistry(registryOrTarget);

  const indexedGraphs = await listIndexedProjects();
  const indexedNames = new Set(indexedGraphs.map((g) => g.name).filter(Boolean));
  const indexedRoots = new Map();
  for (const g of indexedGraphs) {
    if (g.root_path) {
      indexedRoots.set(path.resolve(g.root_path).toLowerCase(), g.name);
    }
  }

  const results = [];
  let purgedCount = 0;

  for (const repo of registry.repos) {
    const normPath = repo.local_path
      ? path.resolve(repo.local_path).toLowerCase()
      : "";
    const cbmSlug = repo.local_path ? deriveCbmSlug(repo.local_path) : "";

    const candidates = [];
    if (indexedRoots.has(normPath)) {
      candidates.push(indexedRoots.get(normPath));
    }
    if (indexedNames.has(repo.name)) {
      candidates.push(repo.name);
    }
    if (indexedNames.has(cbmSlug)) {
      candidates.push(cbmSlug);
    }
    if (candidates.length === 0) {
      candidates.push(repo.name, cbmSlug);
    }

    let repoSuccess = false;
    let lastRes = null;

    for (const cand of candidates) {
      if (!cand) continue;
      const res = await deleteIndexedGraph(cand);
      lastRes = res;
      if (res.status === "success") {
        repoSuccess = true;
        break;
      }
    }

    if (repoSuccess) {
      purgedCount++;
      results.push({ name: repo.name, status: "success" });
    } else {
      results.push(lastRes || { name: repo.name, status: "failed" });
    }
  }

  return {
    project_id: registry.project_id,
    project_name: registry.name,
    total_repos: registry.repos.length,
    purged: purgedCount,
    results,
  };
}

export async function indexSingleRepo(
  repoPath,
  repoName,
  mode = "moderate",
  persistence = true
) {
  const cbmExe = findCodebaseMemoryExecutable();
  if (!cbmExe) {
    return {
      name: repoName,
      path: String(repoPath),
      status: "error",
      error: MISSING_CBM_HELP,
    };
  }

  const resolved = path.resolve(repoPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return {
      name: repoName,
      path: String(repoPath),
      status: "error",
      error: `Repository directory does not exist: ${resolved}`,
    };
  }

  const normalizedPath = resolved.replace(/\\/g, "/");
  const args = [
    "cli",
    "index_repository",
    "--repo-path",
    `"${normalizedPath}"`,
    "--name",
    `"${repoName}"`,
    "--mode",
    mode,
  ];
  if (persistence) {
    args.push("--persistence", "true");
  }

  console.log(`[INFO] Indexing ${repoName} at ${normalizedPath}...`);
  try {
    const res = await runCommand(cbmExe, args, { timeout: 600000 });
    if (res.code === 0) {
      return {
        name: repoName,
        path: normalizedPath,
        status: "success",
        output: res.stdout.trim(),
      };
    } else {
      return {
        name: repoName,
        path: normalizedPath,
        status: "failed",
        error: res.stderr.trim() || res.stdout.trim(),
      };
    }
  } catch (err) {
    const isNotFound =
      err.code === "ENOENT" ||
      (err.message && err.message.includes("not recognized"));
    return {
      name: repoName,
      path: normalizedPath,
      status: "error",
      error: isNotFound ? `${err.message}. ${MISSING_CBM_HELP}` : err.message,
    };
  }
}

export async function batchIndexProject(
  registryOrTarget = null,
  mode = "moderate"
) {
  const registry =
    registryOrTarget instanceof ProjectRegistry
      ? registryOrTarget
      : loadRegistry(registryOrTarget);

  const results = [];
  const total = registry.repos.length;
  let successCount = 0;

  for (let i = 0; i < total; i++) {
    const repo = registry.repos[i];
    console.log(`[${i + 1}/${total}] Indexing repository: ${repo.name} (${repo.local_path})`);
    const res = await indexSingleRepo(repo.local_path, repo.name, mode);
    results.push(res);
    if (res.status === "success") {
      successCount++;
    }
  }

  return {
    project_id: registry.project_id,
    project_name: registry.name,
    total_repos: total,
    successful: successCount,
    failed: total - successCount,
    mode,
    results,
  };
}
