#!/usr/bin/env node

/**
 * CLI interface for oss-mcp (setup, scan, index, list, projects, remove, and run).
 */

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  batchIndexProject,
  listIndexedProjects,
  purgeProjectGraphs,
} from "../src/indexer.js";
import {
  listAvailableProjects,
  loadRegistry,
  saveRegistry,
  unregisterProjectFromCatalog,
} from "../src/registry.js";
import { scanWorkspace } from "../src/scanner.js";
import { run as runServer } from "../src/server.js";

const program = new Command();

program
  .name("oss-mcp")
  .description("Multi-Repo Architecture Hub & MCP Server CLI")
  .version("0.1.0");

// 1. Setup Command
program
  .command("setup [workspace_path]")
  .description(
    "Automated workspace onboarding: Scans directories, generates registry.yaml, and indexes repositories"
  )
  .option(
    "-m, --mode <mode>",
    "Indexing mode: 'moderate', 'full', or 'fast'",
    "moderate"
  )
  .option("-p, --project-id <id>", "Custom project ID")
  .action(async (workspacePath, options) => {
    const targetDir = path.resolve(workspacePath || process.cwd());
    console.log(`[INFO] Initializing multi-repo workspace at: ${targetDir}`);

    // Step 1: Scan
    console.log("[1/2] Scanning repository structure and dependency graph...");
    let registry;
    try {
      registry = scanWorkspace(targetDir, options.projectId);
      const outPath = path.join(targetDir, "registry.yaml");
      saveRegistry(registry, outPath);

      console.log(`      Discovered ${registry.repos.length} repositories:`);
      for (const repo of registry.repos) {
        const stackStr =
          repo.tech_stack.length > 0 ? repo.tech_stack.join(", ") : "Generic";
        const portStr = repo.port ? ` (port ${repo.port})` : "";
        console.log(`      - ${repo.name}: ${stackStr}${portStr}`);
      }
      for (const rel of registry.relationships) {
        console.log(
          `      - Dependency: ${rel.source} -> ${rel.target} [${rel.type}]`
        );
      }
      console.log(`      Registry written to: ${outPath}`);
    } catch (exc) {
      console.error(`[ERROR] Scan failed: ${exc.message}`);
      process.exit(1);
    }

    // Step 2: Index
    console.log("\n[2/2] Indexing repositories with codebase-memory-mcp...");
    try {
      const report = await batchIndexProject(registry, options.mode);
      console.log(
        `      Indexing completed: ${report.successful}/${report.total_repos} repositories indexed successfully.`
      );
      if (report.failed > 0) {
        console.warn(`[WARN] ${report.failed} repositories failed indexing.`);
      }
    } catch (exc) {
      console.error(`[ERROR] Indexing failed: ${exc.message}`);
      process.exit(1);
    }

    console.log("\n[INFO] Workspace initialization completed successfully.");
  });

// 2. Scan Command
program
  .command("scan <target_path>")
  .description("Scan a multi-repo workspace and generate a registry.yaml file")
  .option("-o, --output <output_path>", "Path to write output registry.yaml")
  .option("-p, --project-id <id>", "Custom project identifier")
  .action((targetPath, options) => {
    const targetDir = path.resolve(targetPath);
    console.log(`[INFO] Scanning directory: ${targetDir}`);
    try {
      const registry = scanWorkspace(targetDir, options.projectId);
      console.log(
        `[INFO] Discovered ${registry.repos.length} repositories, inferred ${registry.relationships.length} relationships.`
      );

      for (const repo of registry.repos) {
        const stackStr =
          repo.tech_stack.length > 0 ? repo.tech_stack.join(", ") : "Generic";
        const portStr = repo.port ? ` [port ${repo.port}]` : "";
        console.log(`  * ${repo.name} (${stackStr})${portStr}`);
        console.log(`    Path: ${repo.local_path}`);
      }

      for (const rel of registry.relationships) {
        console.log(`  * Edge: ${rel.source} --(${rel.type})--> ${rel.target}`);
      }

      const outPath = options.output
        ? path.resolve(options.output)
        : path.join(targetDir, "registry.yaml");
      saveRegistry(registry, outPath);
      console.log(`\n[INFO] Registry saved: ${outPath}`);
    } catch (exc) {
      console.error(`[ERROR] Scanning failed: ${exc.message}`);
      process.exit(1);
    }
  });

// 3. Index Command
program
  .command("index")
  .description(
    "Batch index all repositories in the registry into codebase-memory-mcp"
  )
  .option("-r, --registry <path>", "Path to custom registry.yaml")
  .option("-p, --project <id>", "Project ID from catalog")
  .option(
    "-m, --mode <mode>",
    "Indexing mode: 'moderate' (recommended), 'full', or 'fast'",
    "moderate"
  )
  .action(async (options) => {
    const target = options.registry || options.project;
    console.log(
      `[INFO] Loading registry (target: ${target || "default/workspace"})...`
    );
    try {
      const registry = loadRegistry(target);
      console.log(
        `[INFO] Project: ${registry.name} (${registry.repos.length} repositories)`
      );
      console.log(`[INFO] Starting batch indexing (mode: ${options.mode})...\n`);

      const report = await batchIndexProject(registry, options.mode);
      console.log("\n================ INDEXING REPORT ================");
      console.log(`Project:     ${report.project_name} (${report.project_id})`);
      console.log(`Total Repos: ${report.total_repos}`);
      console.log(`Successful:  ${report.successful}`);
      console.log(`Failed:      ${report.failed}`);
      console.log("-------------------------------------------------");
      for (const r of report.results) {
        const icon = r.status === "success" ? "✓" : "✗";
        console.log(` ${icon} ${r.name.padEnd(25)} [${r.status}]`);
        if (r.status !== "success" && r.error) {
          console.log(`   Error: ${r.error}`);
        }
      }
      console.log("=================================================");
    } catch (exc) {
      console.error(`[ERROR] Indexing failed: ${exc.message}`);
      process.exit(1);
    }
  });

// 4. List Command
program
  .command("list")
  .description(
    "Display all repositories, tech stacks, and relationship topology in the active registry"
  )
  .option("-r, --registry <path>", "Path to custom registry.yaml")
  .option("-p, --project <id>", "Project ID from catalog")
  .option("--json", "Output raw JSON representation")
  .action((options) => {
    try {
      const registry = loadRegistry(options.registry || options.project);
      if (options.json) {
        console.log(JSON.stringify(registry.toOverviewDict(), null, 2));
        return;
      }

      console.log(
        `\n=== Multi-Repo Ecosystem: ${registry.name} [${registry.project_id}] ===`
      );
      if (registry.description) {
        console.log(`Description: ${registry.description}`);
      }
      console.log(`Manifest:    ${registry.source_path || "Dynamic"}\n`);

      console.log("Repositories:");
      for (const r of registry.repos) {
        const stackStr =
          r.tech_stack.length > 0 ? r.tech_stack.join(", ") : "Generic";
        const portStr = r.port ? ` [port ${r.port}]` : "";
        console.log(`  * ${r.name.padEnd(22)} ${stackStr}${portStr}`);
        if (r.description) console.log(`    - ${r.description}`);
        if (r.local_path) console.log(`    - Path: ${r.local_path}`);
      }

      if (registry.relationships.length > 0) {
        console.log("\nRelationships:");
        for (const rel of registry.relationships) {
          console.log(
            `  * ${rel.source} --[${rel.type}]--> ${rel.target}`
          );
          if (rel.description) console.log(`    - ${rel.description}`);
        }
      }
      console.log();
    } catch (exc) {
      console.error(`[ERROR] ${exc.message}`);
      process.exit(1);
    }
  });

// 5. Projects Command
program
  .command("projects")
  .description(
    "List all registered projects in the catalog and indexed codebase-memory-mcp graphs"
  )
  .action(async () => {
    try {
      const catalogProjects = listAvailableProjects();
      const indexedGraphs = await listIndexedProjects();

      console.log("\n=== Registered Multi-Repo Projects ===");
      if (catalogProjects.length === 0) {
        console.log("  No projects currently registered in catalog.");
      } else {
        for (const p of catalogProjects) {
          console.log(`  * ${p.project_id.padEnd(16)} - ${p.name}`);
          if (p.description) console.log(`    ${p.description}`);
          if (p.registry_path)
            console.log(`    Registry: ${p.registry_path}`);
          if (p.root_path) console.log(`    Root:     ${p.root_path}`);
        }
      }

      console.log(
        `\n=== Indexed codebase-memory-mcp Knowledge Graphs (${indexedGraphs.length}) ===`
      );
      if (indexedGraphs.length === 0) {
        console.log(
          "  No active codebase-memory-mcp graphs found. Run `oss-mcp index` or `oss-mcp setup` to index."
        );
      } else {
        for (const g of indexedGraphs) {
          const nodes = g.node_count ?? g.nodes ?? "N/A";
          const edges = g.edge_count ?? g.edges ?? "N/A";
          console.log(
            `  * ${(g.name || "Unknown").padEnd(25)} (Nodes: ${nodes}, Edges: ${edges})`
          );
          if (g.root_path) console.log(`    Path: ${g.root_path}`);
        }
      }
      console.log();
    } catch (exc) {
      console.error(`[ERROR] ${exc.message}`);
      process.exit(1);
    }
  });

// 6. Remove Command
program
  .command("remove <project_id_or_path>")
  .description(
    "Decommission a project from the catalog and purge its indexed knowledge graphs"
  )
  .option(
    "--purge-graphs",
    "Purge all codebase-memory-mcp graphs for this project",
    true
  )
  .option(
    "--delete-manifest",
    "Delete the registry.yaml file if given as path",
    false
  )
  .action(async (projectIdOrPath, options) => {
    console.log(`[INFO] Decommissioning project: ${projectIdOrPath}...`);
    try {
      const registry = loadRegistry(projectIdOrPath);

      if (options.purgeGraphs) {
        console.log(
          `[INFO] Purging knowledge graphs for ${registry.repos.length} repositories...`
        );
        const purgeReport = await purgeProjectGraphs(registry);
        console.log(
          `[INFO] Purged ${purgeReport.purged}/${purgeReport.total_repos} graphs.`
        );
      }

      const unregistered = unregisterProjectFromCatalog(registry.project_id);
      if (unregistered) {
        console.log(
          `[INFO] Unregistered '${registry.project_id}' from projects catalog.`
        );
      }

      if (
        options.deleteManifest &&
        registry.source_path &&
        fs.existsSync(registry.source_path)
      ) {
        fs.unlinkSync(registry.source_path);
        console.log(`[INFO] Deleted manifest: ${registry.source_path}`);
      }

      console.log(
        `[INFO] Successfully removed project '${registry.project_id}'.`
      );
    } catch (exc) {
      console.error(`[ERROR] Failed to remove project: ${exc.message}`);
      process.exit(1);
    }
  });

// 7. Run Server Command
program
  .command("run")
  .description("Launch the MCP server on stdio transport")
  .option("-r, --registry <path>", "Path to custom registry.yaml")
  .action(async (options) => {
    if (options.registry) {
      process.env.MCP_REGISTRY_PATH = path.resolve(options.registry);
    }
    await runServer();
  });

program.parse(process.argv);
