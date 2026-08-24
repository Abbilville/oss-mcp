# Multi-Repo Routing & Workflow Configuration

This workspace integrates **Multi-Repo Architecture Routing** with **codebase-memory-mcp**.

---

## Slash Command / Workflow: `/oss` or `/repo`

Use `/oss` as a concise workflow router for multi-repository inquiries:

### 1. Workspace Initialization: `/oss setup [optional_path]`
1. Checks for an existing `registry.yaml` in the active workspace.
2. If missing or unindexed:
   - Executes `scan_and_create_registry(workspace_path="...")`.
   - Executes `index_project_repositories(project="...")`.
3. Returns status summary with discovered repositories, tech stacks, and inferred relationships.

---

### 2. Status & Diagnostic: `/oss status`
1. Calls `list_projects()`.
2. Returns a structured status table:
   - Service name & local path
   - Runtime / tech stack
   - Configured port
   - Graph index coverage (indexed nodes/edges)

---

### 3. Architecture & Cross-Service Queries: `/oss <query>`
*(e.g., `/oss trace authentication flow`, `/oss where is payment signature verified`, `/oss list all redis consumers`)*

1. Calls `get_architecture_overview()` to identify relevant services and dependency edges.
2. Queries `codebase-memory-mcp` scoped to relevant repositories (`search_graph`, `trace_path`, `get_code_snippet`).
3. Synthesizes an **intent-driven response**:
   - **For Code/Implementation questions**: Direct code snippets, logic explanation, parameter validation, and clickable file links (skipping diagrams/UI layers if irrelevant).
   - **For Flow/Lifecycle questions**: Step-by-step request hop (Client $\rightarrow$ Protocol $\rightarrow$ Middleware $\rightarrow$ Handler $\rightarrow$ DB) with a Mermaid sequence diagram.
   - **For Topology/Contract questions**: Summary table of services, ports, and side-by-side DTO/schema comparisons.
   - **For All Other Questions (Debugging, Refactoring, Feature Building, Q&A)**: Direct answer first, relevant code evidence, and concrete actionable solutions without boilerplate.
