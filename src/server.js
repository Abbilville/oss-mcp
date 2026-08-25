/**
 * Multi-Repo Architecture Hub MCP Server (Node.js / ESM).
 *
 * Implements standard MCP tools for architecture discovery, cross-repo relationships,
 * automated directory scanning, batch indexing, and project cleanup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  batchIndexProject,
  deleteIndexedGraph,
  getRepoIndexInfo,
  listIndexedProjects,
  purgeProjectGraphs,
} from "./indexer.js";
import {
  listAvailableProjects,
  loadRegistry,
  saveRegistry,
  unregisterProjectFromCatalog,
} from "./registry.js";
import { scanWorkspace } from "./scanner.js";

// Initialize MCP server
export const server = new McpServer({
  name: "oss-mcp",
  version: "0.1.0",
});

// Tool 1: get_architecture_overview
server.tool(
  "get_architecture_overview",
  "Return a compact JSON overview of all repositories and their relationships.",
  {
    project: z
      .string()
      .optional()
      .describe(
        "Optional project ID or custom registry.yaml file path. If omitted, dynamically resolves from CWD, env var, or default."
      ),
  },
  async ({ project }) => {
    try {
      const registry = loadRegistry(project);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(registry.toOverviewDict(), null, 2),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: get_repo_details
server.tool(
  "get_repo_details",
  "Get comprehensive details for a specific repository within the project.",
  {
    repo_name: z
      .string()
      .describe("Name of the repository (case-insensitive)."),
    project: z
      .string()
      .optional()
      .describe("Optional project ID or registry path."),
  },
  async ({ repo_name, project }) => {
    try {
      const registry = loadRegistry(project);
      const repo = registry.getRepo(repo_name);
      if (!repo) {
        const available = registry.repos.map((r) => r.name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Repository '${repo_name}' not found in project '${registry.project_id}'.`,
                  available_repos: available,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const baseDir = registry.source_path ? path.dirname(registry.source_path) : process.cwd();
      const repoDict = repo.toDict();
      const fullPath = repo.local_path
        ? (path.isAbsolute(repo.local_path) ? repo.local_path : path.resolve(baseDir, repo.local_path))
        : null;

      const idxInfo = getRepoIndexInfo(fullPath, repo.name);
      repoDict.is_indexed = idxInfo.is_indexed;
      repoDict.index_nodes = idxInfo.index_nodes;
      repoDict.index_edges = idxInfo.index_edges;
      repoDict.indexed_at = idxInfo.indexed_at;
      repoDict.index_project = idxInfo.index_project;

      const inbound = registry
        .getInboundRelationships(repo.name)
        .map((rel) => rel.toDict());
      const outbound = registry
        .getOutboundRelationships(repo.name)
        .map((rel) => rel.toDict());

      const result = {
        project_id: registry.project_id,
        repo: repoDict,
        relationships: {
          inbound,
          outbound,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 3: get_related_repos
server.tool(
  "get_related_repos",
  "Find all repositories directly connected to a given repo.",
  {
    repo_name: z
      .string()
      .describe("The source/target repository name."),
    direction: z
      .string()
      .optional()
      .default("all")
      .describe(
        "'inbound' (callers/dependents), 'outbound' (dependencies/APIs called), or 'all' (both)."
      ),
    project: z
      .string()
      .optional()
      .describe("Optional project ID or registry path."),
  },
  async ({ repo_name, direction = "all", project }) => {
    try {
      const registry = loadRegistry(project);
      const repo = registry.getRepo(repo_name);
      if (!repo) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Repository '${repo_name}' not found in registry.` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const inbound = registry
        .getInboundRelationships(repo.name)
        .map((rel) => rel.toDict());
      const outbound = registry
        .getOutboundRelationships(repo.name)
        .map((rel) => rel.toDict());

      let rels = [];
      const dirLower = (direction || "all").toLowerCase();
      if (dirLower === "inbound") {
        rels = inbound;
      } else if (dirLower === "outbound") {
        rels = outbound;
      } else {
        rels = [...inbound, ...outbound];
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                repo: repo_name,
                direction: dirLower,
                total_connections: rels.length,
                relationships: rels,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: list_projects
server.tool(
  "list_projects",
  "List all registered multi-repo projects, catalogs, and codebase-memory-mcp index status.",
  {
    project: z
      .string()
      .optional()
      .describe(
        "Optional project ID, workspace directory, or registry.yaml file path to inspect for index status."
      ),
  },
  async ({ project }) => {
    try {
      const registered = listAvailableProjects();
      const indexed = await listIndexedProjects(project);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                registered_projects: registered,
                indexed_codebase_memory_graphs: indexed,
                total_registered_projects: registered.length,
                total_indexed_graphs: indexed.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 5: scan_and_create_registry
server.tool(
  "scan_and_create_registry",
  "Automatically scan a directory for repositories, infer tech stacks and relationships.",
  {
    workspace_path: z
      .string()
      .describe("Directory containing sub-repositories to scan."),
    output_file: z
      .string()
      .optional()
      .describe(
        "Optional path where to save the generated registry.yaml. If omitted, returns the generated configuration as JSON."
      ),
  },
  async ({ workspace_path, output_file }) => {
    try {
      const registry = scanWorkspace(workspace_path);
      if (output_file) {
        const savedPath = saveRegistry(registry, output_file);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  message: `Successfully generated registry at ${savedPath}`,
                  overview: registry.toOverviewDict(),
                },
                null,
                2
              ),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  overview: registry.toOverviewDict(),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 6: index_project_repositories
server.tool(
  "index_project_repositories",
  "Batch index all repositories in the registry into codebase-memory-mcp.",
  {
    project: z
      .string()
      .optional()
      .describe("Optional project ID or registry file path."),
    mode: z
      .string()
      .optional()
      .default("moderate")
      .describe(
        "Indexing mode: 'moderate' (recommended), 'full' (all files + semantic), or 'fast'."
      ),
  },
  async ({ project, mode = "moderate" }) => {
    try {
      const report = await batchIndexProject(project, mode);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 7: remove_project
server.tool(
  "remove_project",
  "Remove a project from the catalog and purge its codebase-memory-mcp index graphs.",
  {
    project: z
      .string()
      .describe("Project ID or file path to registry.yaml."),
    purge_graphs: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "If true, purges all associated codebase-memory-mcp graph databases."
      ),
    delete_manifest: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "If true and project is a file path, deletes the registry.yaml file."
      ),
  },
  async ({ project, purge_graphs = true, delete_manifest = false }) => {
    try {
      let registry = null;
      try {
        registry = loadRegistry(project);
      } catch {}

      const pId = registry ? registry.project_id : String(project);
      let purgeReport = null;
      if (purge_graphs) {
        if (registry) {
          purgeReport = await purgeProjectGraphs(registry);
        } else {
          const res = await deleteIndexedGraph(pId);
          purgeReport = {
            project_id: pId,
            total_repos: 1,
            purged: res.status === "success" ? 1 : 0,
            results: [res],
          };
        }
      }

      const unregistered = unregisterProjectFromCatalog(pId);

      let manifestDeleted = false;
      if (
        delete_manifest &&
        registry &&
        registry.source_path &&
        fs.existsSync(registry.source_path)
      ) {
        fs.unlinkSync(registry.source_path);
        manifestDeleted = true;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                project_id: pId,
                unregistered_from_catalog: unregistered,
                manifest_deleted: manifestDeleted,
                graph_purge_report: purgeReport,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (exc) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: exc.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

export async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[oss-mcp] MCP Server connected on stdio transport");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  run().catch((err) => {
    console.error("[FATAL] Server error:", err);
    process.exit(1);
  });
}
