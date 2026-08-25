/**
 * Automated Agent AI Setup Module for oss-mcp.
 * Automatically configures MCP servers, workspace rules, and skills for:
 * - Google Antigravity
 * - Claude Desktop & Claude Code
 * - Cursor IDE
 * - OpenAI Codex
 */

import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { findCodebaseMemoryExecutable } from "./indexer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_PATH = path.resolve(ROOT_DIR, "src", "server.js").replace(/\\/g, "/");

/**
 * Resolve the immutable packaged source skills directory.
 */
export function getSourceSkillsDir() {
  const candidates = [
    path.resolve(ROOT_DIR, "skills"),
    path.resolve(ROOT_DIR, ".agents", "skills"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(ROOT_DIR, "skills");
}

/**
 * Safely merge MCP server configuration into a JSON file.
 * Configures both oss-mcp and codebase-memory-mcp so the AI agent has access
 * to both high-level multi-repo topology and deep AST code queries.
 */
export function mergeMcpConfig(filePath, serverConfig = {}) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let data = { mcpServers: {} };
  if (fs.existsSync(resolved)) {
    try {
      const content = fs.readFileSync(resolved, "utf-8").trim();
      if (content) {
        data = JSON.parse(content);
        if (!data.mcpServers) data.mcpServers = {};
      }
    } catch (err) {
      console.warn(`[WARN] Could not parse existing JSON at ${resolved}, backing up...`);
      fs.writeFileSync(`${resolved}.bak`, fs.readFileSync(resolved));
    }
  }

  data.mcpServers["oss-mcp"] = {
    command: "node",
    args: [SERVER_PATH],
    ...serverConfig,
  };

  if (!data.mcpServers["codebase-memory-mcp"]) {
    const cbmExe = findCodebaseMemoryExecutable() || "codebase-memory-mcp";
    data.mcpServers["codebase-memory-mcp"] = {
      command: cbmExe.replace(/\\/g, "/"),
    };
  }

  fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf-8");
  return resolved;
}

/**
 * Recursively copy a directory.
 */
export function copyDirSync(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return false;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

/**
 * Append or create guideline file without duplicate sections.
 */
export function writeGuidelineFile(filePath, content, headerIdentifier) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(resolved)) {
    const existing = fs.readFileSync(resolved, "utf-8");
    if (headerIdentifier && existing.includes(headerIdentifier)) {
      return { path: resolved, updated: false, reason: "Already exists" };
    }
    fs.appendFileSync(resolved, `\n\n${content.trim()}\n`, "utf-8");
    return { path: resolved, updated: true, reason: "Appended" };
  } else {
    fs.writeFileSync(resolved, `${content.trim()}\n`, "utf-8");
    return { path: resolved, updated: true, reason: "Created" };
  }
}

/**
 * Configure Google Antigravity (AGY).
 */
export function setupAntigravity(targetWorkspace = null, isGlobal = false) {
  const results = [];
  const homeDir = os.homedir();

  const baseDir = isGlobal
    ? path.join(homeDir, ".gemini", "config")
    : path.resolve(targetWorkspace || process.cwd(), ".agents");

  // 1. MCP Config
  const mcpConfigFile = path.join(baseDir, "mcp_config.json");
  const mcpSaved = mergeMcpConfig(mcpConfigFile);
  results.push(`✓ Configured MCP Server in: ${mcpSaved}`);

  // 2. Copy Skills
  const sourceSkillsDir = getSourceSkillsDir();
  const targetSkillsDir = path.join(baseDir, "skills");
  if (fs.existsSync(sourceSkillsDir) && path.resolve(sourceSkillsDir) !== path.resolve(targetSkillsDir)) {
    copyDirSync(sourceSkillsDir, targetSkillsDir);
    results.push(`✓ Copied 5 Multi-Repo Skills to: ${targetSkillsDir}`);
  } else if (fs.existsSync(targetSkillsDir)) {
    results.push(`✓ Skills already present in: ${targetSkillsDir}`);
  }

  // 3. Rules / AGENTS.md
  const ruleContent = `# Multi-Repo Routing & Workflow Configuration

This workspace integrates **Multi-Repo Architecture Routing** with **codebase-memory-mcp**.

## Slash Command / Workflow: /oss or /repo
1. **Topology Discovery**: Call \`get_architecture_overview()\` from \`oss-mcp\` to discover service boundaries, entry points, and dependencies.
2. **Deep AST Code Query**: Use \`codebase-memory-mcp\` (\`search_graph\`, \`trace_path\`, \`get_code_snippet\`) scoped to the relevant repository.
3. **Synthesis**:
   - For architecture/flow questions: Provide step-by-step request hops with Mermaid sequence diagrams.
   - For code questions: Provide direct code evidence, parameters, and clickable links.`;

  const agentRulePath = path.join(baseDir, "AGENTS.md");
  const ruleResult = writeGuidelineFile(agentRulePath, ruleContent, "Multi-Repo Architecture Routing");
  results.push(`✓ ${ruleResult.reason} agent rule in: ${ruleResult.path}`);

  return results;
}

/**
 * Configure Claude Desktop & Claude Code CLI.
 */
export function setupClaude(targetWorkspace = null) {
  const results = [];
  const homeDir = os.homedir();

  // 1. Claude Desktop Config Path
  let claudeDesktopPath = "";
  if (process.platform === "win32") {
    claudeDesktopPath = path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  } else if (process.platform === "darwin") {
    claudeDesktopPath = path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else {
    claudeDesktopPath = path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
  }

  try {
    const desktopSaved = mergeMcpConfig(claudeDesktopPath);
    results.push(`✓ Configured Claude Desktop MCP in: ${desktopSaved}`);
  } catch (err) {
    results.push(`! Could not update Claude Desktop config: ${err.message}`);
  }

  // 2. Claude Code Instructions in Workspace (CLAUDE.md)
  const targetDir = path.resolve(targetWorkspace || process.cwd());
  const claudeMdPath = path.join(targetDir, "CLAUDE.md");
  const claudeContent = `## Multi-Repo Architecture Navigation
When answering questions about cross-service interactions, microservices, or APIs:
1. Call \`oss-mcp\` tool \`get_architecture_overview()\` to locate caller/callee services and port contracts.
2. Query \`codebase-memory-mcp\` (\`search_graph\`, \`trace_path\`, \`get_code_snippet\`) scoped by repository name.
3. Synthesize the end-to-end flow with a Mermaid sequence diagram.`;

  const claudeRuleResult = writeGuidelineFile(claudeMdPath, claudeContent, "Multi-Repo Architecture Navigation");
  results.push(`✓ ${claudeRuleResult.reason} CLAUDE.md in: ${claudeRuleResult.path}`);

  return results;
}

/**
 * Configure Cursor IDE.
 */
export function setupCursor(targetWorkspace = null) {
  const results = [];
  const targetDir = path.resolve(targetWorkspace || process.cwd());

  // 1. Cursor MCP Config (.cursor/mcp.json)
  const cursorMcpPath = path.join(targetDir, ".cursor", "mcp.json");
  const savedMcp = mergeMcpConfig(cursorMcpPath);
  results.push(`✓ Configured Cursor MCP in: ${savedMcp}`);

  // 2. Cursor Rule (.cursor/rules/multi-repo.mdc or .cursorrules)
  const ruleDir = path.join(targetDir, ".cursor", "rules");
  const cursorRulePath = path.join(ruleDir, "multi-repo.mdc");
  const ruleContent = `---
description: Multi-repository architecture navigation rules
globs: *
---
You have access to the \`oss-mcp\` MCP server.
When the user asks about multi-service architecture or cross-repo communication:
1. Call \`get_architecture_overview\` to understand service topologies and ports.
2. Trace API calls and dependencies between services.
3. Provide Mermaid sequence diagrams for all cross-service workflows.`;

  const ruleResult = writeGuidelineFile(cursorRulePath, ruleContent, "Multi-repository architecture navigation rules");
  results.push(`✓ ${ruleResult.reason} Cursor rule in: ${ruleResult.path}`);

  return results;
}

/**
 * Configure OpenAI Codex.
 */
export function setupCodex(targetWorkspace = null, isGlobal = false) {
  const results = [];
  const homeDir = os.homedir();
  const targetDir = path.resolve(targetWorkspace || process.cwd());

  // 1. Codex MCP Config
  const codexConfigPath = isGlobal
    ? path.join(homeDir, ".codex", "config.json")
    : path.join(targetDir, ".codex", "config.json");
  const savedMcp = mergeMcpConfig(codexConfigPath);
  results.push(`✓ Configured Codex MCP in: ${savedMcp}`);

  // 2. Codex Instructions (CODEX.md)
  const codexMdPath = path.join(targetDir, "CODEX.md");
  const codexContent = `## Multi-Repo Architecture Navigation
When answering questions about cross-service interactions, microservices, or APIs:
1. Call \`oss-mcp\` tool \`get_architecture_overview()\` to discover architecture topology and service boundaries.
2. Query \`codebase-memory-mcp\` (\`search_graph\`, \`trace_path\`, \`get_code_snippet\`) scoped to the relevant repository.
3. Provide end-to-end flow explanations with dependency contracts.`;

  const codexRuleResult = writeGuidelineFile(codexMdPath, codexContent, "Multi-Repo Architecture Navigation");
  results.push(`✓ ${codexRuleResult.reason} CODEX.md in: ${codexRuleResult.path}`);

  return results;
}

/**
 * Safely remove an MCP server from a JSON configuration file.
 */
export function unmergeMcpConfig(filePath, serverName = "oss-mcp") {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { path: resolved, removed: false, reason: "File does not exist" };
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8").trim();
    if (!content) return { path: resolved, removed: false, reason: "File is empty" };
    const data = JSON.parse(content);
    if (data.mcpServers && data.mcpServers[serverName]) {
      delete data.mcpServers[serverName];
      fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf-8");
      return { path: resolved, removed: true, reason: `Removed ${serverName}` };
    }
    return { path: resolved, removed: false, reason: `${serverName} not configured` };
  } catch (err) {
    return { path: resolved, removed: false, reason: err.message };
  }
}

/**
 * Remove a specific guideline section or delete file if only this section remained.
 */
export function removeGuidelineSection(filePath, headerIdentifier) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { path: resolved, removed: false, reason: "File does not exist" };
  }

  try {
    const existing = fs.readFileSync(resolved, "utf-8");
    if (!existing.includes(headerIdentifier)) {
      return { path: resolved, removed: false, reason: "Section not found" };
    }

    // If file is solely this section or small, delete file or remove matched block
    const lines = existing.split("\n");
    const filtered = [];
    let skipping = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(headerIdentifier)) {
        skipping = true;
        continue;
      }
      if (skipping && line.startsWith("# ") && !line.includes(headerIdentifier)) {
        skipping = false;
      }
      if (!skipping) {
        filtered.push(line);
      }
    }

    const newContent = filtered.join("\n").trim();
    if (!newContent) {
      fs.unlinkSync(resolved);
      return { path: resolved, removed: true, reason: "Deleted empty guideline file" };
    } else {
      fs.writeFileSync(resolved, `${newContent}\n`, "utf-8");
      return { path: resolved, removed: true, reason: "Removed section from guideline" };
    }
  } catch (err) {
    return { path: resolved, removed: false, reason: err.message };
  }
}

/**
 * Remove multi-repo skills from a target skills directory.
 */
export function removeMultiRepoSkills(targetSkillsDir) {
  const resolvedTarget = path.resolve(targetSkillsDir);
  const immutableSource = path.resolve(ROOT_DIR, "skills");
  if (resolvedTarget === immutableSource) {
    // Never delete the immutable packaged source skills directory
    return [];
  }

  const removed = [];
  const skillNames = ["oss", "oss-navigator", "oss-onboard", "oss-remove", "oss-status"];
  for (const name of skillNames) {
    const skillPath = path.join(targetSkillsDir, name);
    if (fs.existsSync(skillPath)) {
      try {
        fs.rmSync(skillPath, { recursive: true, force: true });
        removed.push(name);
      } catch {}
    }
  }
  return removed;
}

/**
 * Uninstall Google Antigravity configuration and skills.
 */
export function uninstallAntigravity(targetWorkspace = null, isGlobal = false) {
  const results = [];
  const homeDir = os.homedir();
  const baseDir = isGlobal
    ? path.join(homeDir, ".gemini", "config")
    : path.resolve(targetWorkspace || process.cwd(), ".agents");

  // 1. Remove from mcp_config.json
  const mcpConfigFile = path.join(baseDir, "mcp_config.json");
  const mcpRes = unmergeMcpConfig(mcpConfigFile, "oss-mcp");
  results.push(`- MCP Server: ${mcpRes.reason} in ${mcpRes.path}`);

  // 2. Remove Skills
  const targetSkillsDir = path.join(baseDir, "skills");
  const removedSkills = removeMultiRepoSkills(targetSkillsDir);
  if (removedSkills.length > 0) {
    results.push(`- Removed ${removedSkills.length} skills (${removedSkills.join(", ")}) from ${targetSkillsDir}`);
  } else {
    results.push(`- No multi-repo skills found in ${targetSkillsDir}`);
  }

  // 3. Clean AGENTS.md rule
  const agentRulePath = path.join(baseDir, "AGENTS.md");
  const ruleRes = removeGuidelineSection(agentRulePath, "Multi-Repo Routing & Workflow Configuration");
  results.push(`- Agent Rules: ${ruleRes.reason} in ${ruleRes.path}`);

  return results;
}

/**
 * Uninstall Claude Desktop & Claude Code CLI.
 */
export function uninstallClaude(targetWorkspace = null) {
  const results = [];
  const homeDir = os.homedir();

  let claudeDesktopPath = "";
  if (process.platform === "win32") {
    claudeDesktopPath = path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  } else if (process.platform === "darwin") {
    claudeDesktopPath = path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else {
    claudeDesktopPath = path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
  }

  const mcpRes = unmergeMcpConfig(claudeDesktopPath, "oss-mcp");
  results.push(`- Claude Desktop MCP: ${mcpRes.reason} in ${mcpRes.path}`);

  const targetDir = path.resolve(targetWorkspace || process.cwd());
  const claudeMdPath = path.join(targetDir, "CLAUDE.md");
  const ruleRes = removeGuidelineSection(claudeMdPath, "Multi-Repo Architecture Navigation");
  results.push(`- CLAUDE.md: ${ruleRes.reason} in ${ruleRes.path}`);

  return results;
}

/**
 * Uninstall Cursor IDE.
 */
export function uninstallCursor(targetWorkspace = null) {
  const results = [];
  const targetDir = path.resolve(targetWorkspace || process.cwd());

  const cursorMcpPath = path.join(targetDir, ".cursor", "mcp.json");
  const mcpRes = unmergeMcpConfig(cursorMcpPath, "oss-mcp");
  results.push(`- Cursor MCP: ${mcpRes.reason} in ${mcpRes.path}`);

  const cursorRulePath = path.join(targetDir, ".cursor", "rules", "multi-repo.mdc");
  if (fs.existsSync(cursorRulePath)) {
    try {
      fs.unlinkSync(cursorRulePath);
      results.push(`- Cursor Rule: Deleted ${cursorRulePath}`);
    } catch (err) {
      results.push(`- Cursor Rule: Failed to delete ${cursorRulePath} (${err.message})`);
    }
  } else {
    results.push(`- Cursor Rule: Rule file not present in ${cursorRulePath}`);
  }

  return results;
}

/**
 * Uninstall OpenAI Codex.
 */
export function uninstallCodex(targetWorkspace = null, isGlobal = false) {
  const results = [];
  const homeDir = os.homedir();
  const targetDir = path.resolve(targetWorkspace || process.cwd());

  const codexConfigPath = isGlobal
    ? path.join(homeDir, ".codex", "config.json")
    : path.join(targetDir, ".codex", "config.json");
  const mcpRes = unmergeMcpConfig(codexConfigPath, "oss-mcp");
  results.push(`- Codex MCP: ${mcpRes.reason} in ${mcpRes.path}`);

  const codexMdPath = path.join(targetDir, "CODEX.md");
  const ruleRes = removeGuidelineSection(codexMdPath, "Multi-Repo Architecture Navigation");
  results.push(`- CODEX.md: ${ruleRes.reason} in ${ruleRes.path}`);

  return results;
}

/**
 * Run setup for one or all agents.
 */
export function runAgentSetup(agentChoice, targetWorkspace = null, isGlobal = false) {
  const allResults = {};
  const choice = String(agentChoice).toLowerCase().trim();

  if (choice === "1" || choice === "antigravity" || choice === "all" || choice === "5") {
    allResults["Google Antigravity"] = setupAntigravity(targetWorkspace, isGlobal);
  }
  if (choice === "2" || choice === "claude" || choice === "all" || choice === "5") {
    allResults["Claude (Desktop & Code)"] = setupClaude(targetWorkspace);
  }
  if (choice === "3" || choice === "cursor" || choice === "all" || choice === "5") {
    allResults["Cursor IDE"] = setupCursor(targetWorkspace);
  }
  if (choice === "4" || choice === "codex" || choice === "all" || choice === "5") {
    allResults["OpenAI Codex"] = setupCodex(targetWorkspace, isGlobal);
  }

  return allResults;
}

/**
 * Run uninstall for one or all agents.
 */
export function runAgentUninstall(agentChoice, targetWorkspace = null, isGlobal = false, cleanCache = false) {
  const allResults = {};
  const choice = String(agentChoice).toLowerCase().trim();

  if (choice === "1" || choice === "antigravity" || choice === "all" || choice === "5") {
    allResults["Google Antigravity"] = uninstallAntigravity(targetWorkspace, isGlobal);
  }
  if (choice === "2" || choice === "claude" || choice === "all" || choice === "5") {
    allResults["Claude (Desktop & Code)"] = uninstallClaude(targetWorkspace);
  }
  if (choice === "3" || choice === "cursor" || choice === "all" || choice === "5") {
    allResults["Cursor IDE"] = uninstallCursor(targetWorkspace);
  }
  if (choice === "4" || choice === "codex" || choice === "all" || choice === "5") {
    allResults["OpenAI Codex"] = uninstallCodex(targetWorkspace, isGlobal);
  }

  if (cleanCache) {
    const userConfigDir = path.join(os.homedir(), ".config", "oss-mcp");
    if (fs.existsSync(userConfigDir)) {
      try {
        fs.rmSync(userConfigDir, { recursive: true, force: true });
        allResults["Global Cache & Catalog"] = [`- Removed configuration directory: ${userConfigDir}`];
      } catch (err) {
        allResults["Global Cache & Catalog"] = [`! Could not remove ${userConfigDir}: ${err.message}`];
      }
    }
  }

  return allResults;
}

/**
 * Check for updates from GitHub or NPM registry and optionally pull latest code.
 */
export async function checkForRemoteUpdates() {
  const localPkgPath = path.join(ROOT_DIR, "package.json");
  let localVersion = "0.1.0";
  try {
    if (fs.existsSync(localPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(localPkgPath, "utf-8"));
      localVersion = pkg.version || "0.1.0";
    }
  } catch {}

  const isGitRepo = fs.existsSync(path.join(ROOT_DIR, ".git"));
  const report = {
    current_version: localVersion,
    is_git_repo: isGitRepo,
    remote_version: null,
    has_git_updates: false,
    git_pulled: false,
    message: "",
  };

  // 1. If it's a Git clone, check git remote status and pull updates
  if (isGitRepo) {
    try {
      // Fetch latest commits from remote with timeout
      await new Promise((resolve) => {
        exec("git fetch origin", { cwd: ROOT_DIR, timeout: 8000 }, () => resolve());
      });

      // Check commit difference
      const behindCount = await new Promise((resolve) => {
        exec(
          "git rev-list HEAD..origin/main --count",
          { cwd: ROOT_DIR, timeout: 5000 },
          (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              resolve(parseInt(stdout.trim(), 10) || 0);
            } else {
              resolve(0);
            }
          }
        );
      });

      if (behindCount > 0) {
        report.has_git_updates = true;
        // Attempt pull
        const pullOutput = await new Promise((resolve) => {
          exec("git pull origin main", { cwd: ROOT_DIR, timeout: 15000 }, (err, stdout, stderr) => {
            if (!err) {
              resolve({ success: true, log: stdout.trim() });
            } else {
              resolve({ success: false, log: stderr.trim() || err.message });
            }
          });
        });

        if (pullOutput.success) {
          report.git_pulled = true;
          report.message = `Successfully pulled ${behindCount} new commit(s) from GitHub (origin/main).`;
        } else {
          report.message = `New updates found on GitHub (${behindCount} commits behind), but git pull encountered: ${pullOutput.log}`;
        }
      } else {
        report.message = `Codebase is up to date with GitHub (origin/main).`;
      }
    } catch (err) {
      report.message = `Git check skipped: ${err.message}`;
    }
  }

  // 2. Query GitHub releases for latest tagged version
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://api.github.com/repos/Abbilville/oss-mcp/releases/latest", {
      headers: { "User-Agent": "oss-mcp-updater" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.tag_name) {
        report.remote_version = data.tag_name.replace(/^v/, "");
      }
    }
  } catch {}

  return report;
}

/**
 * Run update for one or all agents (checks GitHub for latest version, pulls updates, re-syncs skills & rules).
 */
export async function runAgentUpdate(agentChoice, targetWorkspace = null, isGlobal = false) {
  const allResults = {};
  const choice = String(agentChoice).toLowerCase().trim();

  // 1. Check for remote updates from GitHub
  const remoteReport = await checkForRemoteUpdates();
  const remoteLogs = [
    `Current Version: v${remoteReport.current_version}`,
    remoteReport.remote_version ? `Latest GitHub Release: v${remoteReport.remote_version}` : null,
    remoteReport.message ? `GitHub Status: ${remoteReport.message}` : null,
  ].filter(Boolean);

  allResults["GitHub & Core Package Update"] = remoteLogs;

  // 2. Re-run setup to refresh skills, rules, and configurations
  const setupResults = runAgentSetup(choice, targetWorkspace, isGlobal);

  for (const [agent, logs] of Object.entries(setupResults)) {
    allResults[agent] = [
      "✓ Re-synced latest MCP server configurations",
      "✓ Updated multi-repo skills & schemas to current version",
      ...logs,
    ];
  }

  return allResults;
}
