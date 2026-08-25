#!/usr/bin/env node

/**
 * Interactive CLI wizard to setup, update, or uninstall oss-mcp and skills for AI agents.
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import process from "node:process";
import path from "node:path";
import {
  runAgentSetup,
  runAgentUninstall,
  runAgentUpdate,
} from "../src/agent-setup.js";
import { checkCodebaseMemoryStatus } from "../src/indexer.js";

async function main() {
  console.log("\n========================================================");
  console.log("  Multi-Repo Hub (`oss-mcp`) AI Agent Manager Wizard");
  console.log("========================================================\n");

  const cbm = checkCodebaseMemoryStatus();
  if (cbm.available) {
    console.log(`[INFO] codebase-memory-mcp detected: ${cbm.executable}\n`);
  } else {
    console.log(`[WARN] codebase-memory-mcp was not found in PATH.`);
    console.log(`       oss-mcp pairs with codebase-memory-mcp for AST indexing.`);
    console.log(`       Install globally: ${cbm.installCommand}\n`);
  }

  const args = process.argv.slice(2);
  let mode = "setup"; // 'setup', 'update', 'uninstall'
  let agentArg = null;
  let workspaceArg = null;
  let isGlobalArg = false;
  let cleanCacheArg = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--uninstall" || args[i] === "-u") {
      mode = "uninstall";
    } else if (args[i] === "--update") {
      mode = "update";
    } else if (args[i] === "--setup") {
      mode = "setup";
    } else if (args[i] === "--agent" && args[i + 1]) {
      agentArg = args[++i];
    } else if (args[i] === "--workspace" && args[i + 1]) {
      workspaceArg = args[++i];
    } else if (args[i] === "--global" || args[i] === "-g") {
      isGlobalArg = true;
    } else if (args[i] === "--clean-cache") {
      cleanCacheArg = true;
    }
  }

  // If arguments provided non-interactively
  if (agentArg) {
    const targetWs = workspaceArg ? path.resolve(workspaceArg) : process.cwd();
    const scopeStr = isGlobalArg ? "Global" : `Workspace (${targetWs})`;
    console.log(`[INFO] Action: ${mode.toUpperCase()} for agent: ${agentArg} [Scope: ${scopeStr}]`);

    let results = {};
    if (mode === "uninstall") {
      results = runAgentUninstall(agentArg, targetWs, isGlobalArg, cleanCacheArg);
    } else if (mode === "update") {
      results = runAgentUpdate(agentArg, targetWs, isGlobalArg);
    } else {
      results = runAgentSetup(agentArg, targetWs, isGlobalArg);
    }
    printResults(results);
    return;
  }

  // Interactive prompt
  const rl = readline.createInterface({ input, output });

  try {
    let actionChoice = "1";
    if (mode === "setup") {
      console.log("Select Action:");
      console.log("  [1] Setup / Install oss-mcp & multi-repo skills into AI agents");
      console.log("  [2] Update / Re-sync latest MCP server configs, skills & rules");
      console.log("  [3] Uninstall / Remove oss-mcp & skills from AI agents\n");

      actionChoice = (await rl.question("Enter choice [1-3] (default: 1): ")).trim() || "1";
      if (actionChoice === "2") mode = "update";
      else if (actionChoice === "3") mode = "uninstall";
      console.log();
    }

    const actionLabel = mode === "uninstall" ? "UNINSTALL from" : (mode === "update" ? "UPDATE for" : "CONFIGURE with");

    console.log(`Select which AI Agent / IDE you want to ${actionLabel} oss-mcp:\n`);
    console.log("  [1] Google Antigravity         - Skills, AGENTS.md, & MCP config");
    console.log("  [2] Claude (Desktop & Code)    - claude_desktop_config.json & CLAUDE.md");
    console.log("  [3] Cursor IDE                 - .cursor/mcp.json & rules");
    console.log("  [4] OpenAI Codex / CLI         - .codex config & CODEX.md");
    console.log("  [5] ALL AGENTS (Apply to all of the above)\n");

    const answer = (await rl.question("Enter choice [1-5] (default: 5): ")).trim() || "5";

    console.log("\nSelect target scope:");
    console.log("  [1] Global (Available machine-wide across all projects)");
    console.log("  [2] Current workspace / project only");
    console.log("  [3] Custom workspace path\n");

    const scopeChoice = (await rl.question("Enter scope choice [1-3] (default: 1): ")).trim() || "1";

    let isGlobal = false;
    let targetWorkspace = process.cwd();

    if (scopeChoice === "1") {
      isGlobal = true;
    } else if (scopeChoice === "3") {
      const customPath = (await rl.question("\nEnter custom workspace path: ")).trim();
      targetWorkspace = customPath ? path.resolve(customPath) : process.cwd();
    }

    let cleanCache = false;
    if (mode === "uninstall" && isGlobal) {
      const cleanAns = (await rl.question("\nAlso purge ~/.config/oss-mcp/ catalog? (y/N): ")).trim().toLowerCase();
      cleanCache = cleanAns === "y" || cleanAns === "yes";
    }

    const scopeLabel = isGlobal ? "Globally (All Projects)" : `Workspace (${targetWorkspace})`;
    console.log(`\nExecuting ${mode.toUpperCase()} for AI Agent(s) ${scopeLabel}...\n`);

    let results = {};
    if (mode === "uninstall") {
      results = runAgentUninstall(answer, targetWorkspace, isGlobal, cleanCache);
    } else if (mode === "update") {
      results = runAgentUpdate(answer, targetWorkspace, isGlobal);
    } else {
      results = runAgentSetup(answer, targetWorkspace, isGlobal);
    }
    printResults(results);

    console.log(`\nAgent ${mode} completed successfully!`);
    console.log("Restart your coding agent or IDE for changes to take effect.\n");
  } catch (err) {
    console.error(`\n[ERROR] Operation failed: ${err.message}`);
  } finally {
    rl.close();
  }
}

function printResults(results) {
  for (const [agent, logs] of Object.entries(results)) {
    console.log(`\n--- ${agent} ---`);
    for (const log of logs) {
      console.log(`  ${log}`);
    }
  }
}

main();
