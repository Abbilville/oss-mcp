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
import { ProjectRegistry, loadRegistry } from "./registry.js";

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

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const fullCmd = isWindows ? `${command} ${args.join(" ")}` : command;

    if (isWindows) {
      exec(
        fullCmd,
        {
          timeout: options.timeout || 600000,
          maxBuffer: 10 * 1024 * 1024,
          ...options,
        },
        (error, stdout, stderr) => {
          resolve({
            code: error ? error.code || 1 : 0,
            stdout: stdout || "",
            stderr: stderr || "",
            error: error ? error.message : null,
          });
        }
      );
    } else {
      execFile(
        command,
        args,
        {
          timeout: options.timeout || 600000,
          maxBuffer: 10 * 1024 * 1024,
          ...options,
        },
        (error, stdout, stderr) => {
          resolve({
            code: error ? error.code || 1 : 0,
            stdout: stdout || "",
            stderr: stderr || "",
            error: error ? error.message : null,
          });
        }
      );
    }
  });
}

export async function listIndexedProjects() {
  const cbmExe = findCodebaseMemoryExecutable();
  if (!cbmExe) return [];

  try {
    const res = await runCommand(cbmExe, ["cli", "--json", "list_projects"], {
      timeout: 30000,
    });
    const combined = res.stdout + "\n" + res.stderr;
    for (const line of combined.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") && trimmed.includes('"projects"')) {
        const parsed = JSON.parse(trimmed);
        return parsed.projects || [];
      }
    }
  } catch (err) {
    console.warn("[WARN] Failed to list indexed projects:", err.message);
  }
  return [];
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

function deriveCbmSlug(localPath) {
  return localPath
    .trim()
    .replace(/^[/\\]+/, "")
    .replace(/[/\\]+$/, "")
    .replace(/[:/\\]+/g, "-");
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
