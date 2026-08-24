# Multi-Repo Architecture Hub (`oss-mcp`)

[![Node.js Version](https://img.shields.io/badge/node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-orange.svg)](https://modelcontextprotocol.io/)
[![Package Manager](https://img.shields.io/badge/managed%20by-npm-red.svg)](https://www.npmjs.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An extensible Multi-Repo Architecture Router and Model Context Protocol (MCP) server written in Node.js (ESM). Designed for cross-repository dependency discovery, topological routing, and batch AST indexing integration with [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp).

---

## ⚡ Quick Start (3-Minute Setup)

### 1. Prerequisites
Ensure you have **Node.js (>= 18)** and **codebase-memory-mcp** installed globally:
```bash
# Install codebase-memory-mcp globally
npm install -g codebase-memory-mcp@latest
```

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/Abbilville/oss-mcp oss-mcp
cd oss-mcp
npm install
```

### 3. Initialize Any Multi-Repo Workspace
Point `oss-mcp` to your microservices directory. It will scan the repositories, generate `registry.yaml`, and automatically batch-index the code into AST knowledge graphs:
```bash
npx oss-mcp setup /path/to/your/microservices-workspace
```

---

## 🚀 Key Capabilities

1. **Multi-Project Dynamic Discovery**: Resolves repository manifests (`registry.yaml`) dynamically from CLI parameters, central catalogs (`data/projects.yaml`), environment variables, or workspace hierarchy.
2. **Automated Structure & Dependency Scanner**: Recursively inspects directory trees across multiple tech stacks (Node.js, Express, React, Python, FastAPI, Java, Go), detecting entry points, ports, and inter-service HTTP/event relationships.
3. **Automated Batch AST Indexing**: Orchestrates `codebase-memory-mcp` AST graph indexing across all services in a project manifest with a single command.
4. **Structured MCP Interface**: Exposes standardized tools for AI agents to query cross-service architectures, trace end-to-end request lifecycles, and navigate multi-service boundaries.

---

## 📁 Working with the `data/` Directory

The `data/` directory provides centralized project management for environments hosting multiple distinct microservice projects or systems.

```text
data/
├── projects.yaml         # Central multi-project catalog (routes project IDs to manifests)
├── registry.yaml         # Default / sample repository manifest and service relationships
├── projects.yaml.example # Reference template for projects catalog
└── registry.yaml.example # Reference template for repository manifests
```

### 1. Central Project Catalog (`data/projects.yaml`)
If you manage multiple projects on your machine, register them in `data/projects.yaml` (or `~/.config/oss-mcp/projects.yaml`). This lets you target any project by ID (e.g. `npx oss-mcp index --project ecommerce`):

```yaml
# data/projects.yaml
projects:
  ecommerce:
    name: "E-Commerce Microservices"
    description: "Frontend SPA, API Gateway, Auth Service, and Order Service"
    registry_path: "./data/ecommerce_registry.yaml"
    root_path: "/path/to/ecommerce/workspace"

  analytics:
    name: "Analytics Platform"
    description: "Event streaming and reporting backend"
    registry_path: "/path/to/analytics/registry.yaml"
    root_path: "/path/to/analytics/workspace"
```

---

### 2. Repository Manifest (`registry.yaml`)
Each project has a `registry.yaml` defining its individual services, metadata, entry points, ports, and relationships.

```yaml
# registry.yaml
repos:
  - name: backend-service
    owner: backend-team
    local_path: ./services/backend-service
    description: "REST API server handling auth, database persistence, and business logic"
    tech_stack:
      - Node.js
      - Express
      - PostgreSQL
      - Redis
      - JWT
    entry_point: src/server.js
    port: 4000

  - name: web-frontend
    owner: frontend-team
    local_path: ./services/web-frontend
    description: "Customer SPA built with React and TypeScript"
    tech_stack:
      - React
      - TypeScript
      - Axios
    entry_point: src/index.tsx
    port: 3000

relationships:
  - source: web-frontend
    target: backend-service
    type: api_call
    description: "Frontend makes REST API calls to backend endpoints for data and authentication."

  - source: web-frontend
    target: backend-service
    type: depends_on
    description: "Frontend depends on backend JWT session management and RBAC permissions."
```

#### Supported Relationship Types
- `api_call`: HTTP / REST / GraphQL invocation from source to target.
- `depends_on`: Architectural or lifecycle dependency (e.g., shared session, contract dependency).
- `event_stream`: Asynchronous messaging (Kafka, RabbitMQ, Redis Pub/Sub, AWS EventBridge).
- `shared_resource`: Shared database schema, cache instance, or storage bucket.
- `submodule`: Git submodule or monorepo package reference.

---

## 🎯 Manifest Resolution Hierarchy

When executing tools or CLI commands, `oss-mcp` determines which registry to load using a 4-tier fallback:

```
1. Explicit Flag / Parameter   (--project "ecommerce" or --registry "/path/to/registry.yaml")
   └── 2. Central Projects Catalog (data/projects.yaml or ~/.config/oss-mcp/projects.yaml)
       └── 3. Environment Variable   (export MCP_REGISTRY_PATH="/path/to/registry.yaml")
           └── 4. Workspace Traversal (searching current directory & parent folders for registry.yaml)
```

---

## 💻 CLI Reference

| Action | Command | Description |
| :--- | :--- | :--- |
| **Onboard Workspace** | `npx oss-mcp setup /path/to/workspace` | Scans workspace, writes `registry.yaml`, and batch-indexes all services. |
| **Scan Directory** | `npx oss-mcp scan /path/to/workspace -o ./registry.yaml` | Scans directories, infers entry points/ports, and outputs manifest. |
| **Batch Index** | `npx oss-mcp index --registry ./registry.yaml` | Indexes all manifest repos into `codebase-memory-mcp`. |
| **List Services** | `npx oss-mcp list --registry ./registry.yaml` | Displays summary table of services, ports, and dependencies. |
| **List Projects** | `npx oss-mcp projects` | Shows all registered projects and index graph status. |
| **Decommission** | `npx oss-mcp remove <project_id_or_path> [--delete-manifest]` | Purges indexed graphs and unregisters project from catalog. |
| **Start Server** | `npx oss-mcp run` | Launches the MCP server on stdio transport. |

---

## 🤖 AI Assistant & IDE Integration

`oss-mcp` provides an architectural bridge that works in tandem with `codebase-memory-mcp`. 

```
┌─────────────────────────────────────────────────────────────┐
│                       AI Agent Layer                        │
│   (Antigravity / Claude Code / Cursor / Codex / Roo Code)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │          oss-mcp          │   │    codebase-memory-mcp    │
 │                           │   │                           │
 │ • Multi-repo discovery    │   │ • Deep AST function index │
 │ • Service topology & port │   │ • Class & symbol search   │
 │ • Cross-repo relationships│   │ • Call graph path tracing │
 │ • Batch index management  │   │ • Source code snippets    │
 └───────────────────────────┘   └───────────────────────────┘
```

---

### 1. 🪐 Google Antigravity (AGY)

#### A. Configure MCP Server
Add `oss-mcp` to your project's `.agents/mcp_config.json` or globally in `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "oss-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/oss-mcp/src/server.js"]
    }
  }
}
```

#### B. Install Workspace Skills & Rules
1. Copy or symlink the `.agents/skills/` directory into your active project's `.agents/skills/` (or global `~/.gemini/config/skills/`).
2. Include the multi-repo routing rule in `.agents/AGENTS.md`:
   ```markdown
   # Multi-Repo Routing
   For any question spanning multiple services or repositories, use the `oss-mcp` MCP server to discover topology with `get_architecture_overview()`, then query `codebase-memory-mcp` scoped to relevant repositories.
   ```

#### C. Antigravity Slash Commands & Usage
Type these commands directly in Antigravity chat:
- `/oss setup /path/to/microservices` — Auto-scan workspace, infer stacks & ports, generate `registry.yaml`, and batch-index into AST graphs.
- `/oss status` — View table of registered services, ports, and graph node/edge counts.
- `/oss trace checkout flow from UI to backend` — Trace end-to-end cross-service lifecycles with sequence diagrams.
- `/oss remove <project_id>` — Safely unregister project and purge knowledge graphs.

---

### 2. ⚡ Claude Code (CLI) & Claude Desktop

#### A. Claude Code CLI Setup
Add the MCP server directly using the `claude mcp add` command:

```bash
# Add oss-mcp MCP server
claude mcp add oss-mcp node /absolute/path/to/oss-mcp/src/server.js
```

Or add to your project's `.claude.json` / `settings.json`:
```json
{
  "mcpServers": {
    "oss-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/oss-mcp/src/server.js"]
    }
  }
}
```

#### B. Claude Desktop Setup
Open your Claude Desktop config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the server definition:
```json
{
  "mcpServers": {
    "oss-mcp": {
      "command": "node",
      "args": ["C:/Telkom/oss-mcp/src/server.js"]
    }
  }
}
```

#### C. Claude Workflow Instruction (`CLAUDE.md`)
Add this guideline to your project's `CLAUDE.md` to teach Claude how to route multi-repo queries:
```markdown
## Multi-Repo Architecture Navigation
When answering questions about cross-service interactions, microservices, or APIs:
1. Call `oss-mcp` tool `get_architecture_overview()` to locate caller/callee services and port contracts.
2. Query `codebase-memory-mcp` (`search_graph`, `trace_path`, `get_code_snippet`) scoped by repository name.
3. Synthesize the end-to-end flow with a Mermaid sequence diagram.
```

#### D. Example Chat Prompts in Claude
- *"Scan the folder `../services` and initialize the multi-repo registry."*
- *"Show all registered microservices and check if their AST graphs are indexed."*
- *"Trace the JWT authentication flow from frontend login to backend token verification."*

---

### 3. 🎯 Cursor IDE

#### A. Add MCP Server in Cursor
1. Go to **Cursor Settings** $\rightarrow$ **Features** $\rightarrow$ **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in:
   - **Name**: `oss-mcp`
   - **Type**: `command`
   - **Command**: `node /absolute/path/to/oss-mcp/src/server.js`
4. Click Save and verify the green status dot.

#### B. Cursor Rules (`.cursorrules` or `.cursor/rules/multi-repo.mdc`)
Create a rule file in your workspace:
```markdown
---
description: Multi-repository architecture navigation rules
globs: *
---
You have access to the `oss-mcp` MCP server.
When the user asks about multi-service architecture or cross-repo communication:
1. Call `get_architecture_overview` to understand service topologies and ports.
2. Trace API calls and dependencies between services.
3. Provide Mermaid sequence diagrams for all cross-service workflows.
```

#### C. Example Chat Prompts in Cursor
- `@oss-mcp What services communicate with the payment backend?`
- `@oss-mcp Scan this multi-repo workspace and generate registry.yaml`
- `How does the frontend client fetch products from the catalog API? Trace the route and handler.`

---

### 4. 🧩 Roo Code / Cline / Codex (VS Code Extensions)

#### A. Configure MCP Settings
Open `cline_mcp_settings.json` (or `roo_cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "oss-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/oss-mcp/src/server.js"],
      "disabled": false,
      "autoApprove": [
        "get_architecture_overview",
        "get_repo_details",
        "get_related_repos",
        "list_projects"
      ]
    }
  }
}
```

#### B. Custom Instructions
Add to your Custom Instructions in Cline / Roo Code settings:
```text
When working across multiple repositories, use the `oss-mcp` MCP tools to inspect service dependencies and ports before making code modifications or answering architectural questions.
```

---

## 🛠️ Workspace Skills Deep-Dive

Skills in `.agents/skills/` encapsulate complete end-to-end multi-repo workflows:

| Skill | Primary Trigger | Workflow Performed |
| :--- | :--- | :--- |
| **`oss`** | `/oss <query>` or *"Trace cross-repo flow..."* | **Autonomous Master Navigator**: Verifies index status $\rightarrow$ auto-scans & batch-indexes missing repos $\rightarrow$ loads topology $\rightarrow$ executes scoped AST queries $\rightarrow$ synthesizes sequence diagrams. |
| **`oss-navigator`** | Cross-service flow inquiry | **Query Router**: Queries `get_architecture_overview()` $\rightarrow$ traces caller client $\rightarrow$ traces callee route handler $\rightarrow$ generates Mermaid sequence diagram. |
| **`oss-onboard`** | `/oss setup [path]` or *"Scan folder..."* | **Onboarding Wizard**: Recursively scans directory $\rightarrow$ detects tech stacks & ports $\rightarrow$ writes `registry.yaml` $\rightarrow$ triggers batch AST indexing. |
| **`oss-status`** | `/oss status` or *"Check multi-repo status"* | **Diagnostics**: Queries catalog projects and indexed graph node/edge statistics $\rightarrow$ renders status summary table. |
| **`oss-remove`** | `/oss remove <project_id>` | **Cleanup**: Decommissions project from catalog $\rightarrow$ purges knowledge graph databases $\rightarrow$ deletes manifest if requested. |

---

## 🔌 MCP Tools Reference

| Tool | Parameters | Output | Description |
| :--- | :--- | :--- | :--- |
| `get_architecture_overview` | `project?: str` | JSON | Returns complete repository manifest, service metadata, and relationship graph. |
| `get_repo_details` | `repo_name: str, project?: str` | JSON | Returns detailed information for a single repository, including ports, stack, and direct connections. |
| `get_related_repos` | `repo_name: str, direction?: str, project?: str` | JSON | Returns connected dependencies (`inbound`, `outbound`, or `all`). |
| `list_projects` | None | JSON | Lists catalog projects and indexed `codebase-memory-mcp` graph database statistics. |
| `scan_and_create_registry` | `workspace_path: str, output_file?: str` | JSON | Scans directory, infers dependencies, and generates a manifest file. |
| `index_project_repositories` | `project?: str, mode?: str` | JSON | Batch indexes repositories into `codebase-memory-mcp`. |
| `remove_project` | `project: str, purge_graphs?: bool, delete_manifest?: bool` | JSON | Purges indexed graphs and unregisters project from catalog. |

---

## License

Distributed under the MIT License.
