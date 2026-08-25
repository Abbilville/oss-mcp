---
name: oss-status
description: >-
  Multi-repo registry and index health diagnostics. Activate when checking which projects
  are registered, verifying codebase-memory-mcp index coverage, finding unindexed repos,
  or inspecting repo metadata and ports.
---

# Multi-Repo Status & Health Diagnostics Skill

This skill inspects the health, indexing coverage, and configuration of all registered multi-repo projects.

---

## When to Activate

Activate this skill when:
- The user asks *"Which projects are registered?"*, *"Is my repo indexed?"*, or *"Check multi-repo status"*.
- Auditing index coverage across repositories in a project.
- Troubleshooting missing relationships or stale graph indexes.

---

## Diagnostic Procedure

### 1. Check Registered Projects & Indexed Graphs
Call the `list_projects()` MCP tool:

```python
list_projects()
```
*Or via CLI: `npx oss-mcp projects`*

**Look for:**
- `registered_projects`: Confirms which `registry.yaml` files are active in the catalog or workspace.
- `indexed_codebase_memory_graphs`: Lists graphs built in `codebase-memory-mcp` with their node and edge counts.

---

### 2. Verify Index Coverage per Repository
For a given project, compare the repos declared in `registry.yaml` against the indexed graphs:

1. Call `get_architecture_overview(project="<project_id>")`.
2. Extract all repo names from `repos[]`.
3. Verify each repo has an active graph entry in `codebase-memory-mcp`.

---

### 3. Remediate Missing or Stale Indexes
If any repository is missing from `codebase-memory-mcp`:

```python
# Re-index specific project repos
index_project_repositories(project="<project_id_or_path>", mode="moderate")
```
*Or via CLI: `npx oss-mcp index --registry <registry_path>`*

---

### 4. Output Status Table

Present the diagnostic report to the user:

| Repository | Tech Stack | Port | Registry Status | CBM Graph Index |
| :--- | :--- | :--- | :--- | :--- |
| `web-glob-admin-be` | Node.js / Express | 4003 | Configured | Indexed (1813 nodes) |
| `seller-glob` | React 18 / CRA | 3000 | Configured | Indexed (2583 nodes) |
