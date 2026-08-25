---
name: oss-remove
description: >-
  Multi-repo project decommissioning and index graph cleanup. Activate when removing
  a project, purging stale codebase-memory-mcp index graphs, unregistering a project
  from the catalog, or deleting repository manifests.
---

# Multi-Repo Project Removal & Graph Purge Skill

This skill handles project decommissioning, catalog unregistration, and purging graph index databases from `codebase-memory-mcp`.

---

## When to Activate

Activate this skill when:
- The user asks to "remove project X", "delete index for project Y", "purge stale codebase graphs", or "decommission this multi-repo setup".
- Cleaning up test or deprecated repositories from `codebase-memory-mcp`.

---

## Decommissioning Procedure

### 1. Identify Target Project
Confirm the project identifier or path to `registry.yaml`:
```python
# Check currently registered and indexed projects
list_projects()
```

---

### 2. Execute Project Removal & Graph Purge
Call `remove_project` on the `oss-mcp` MCP server:

```python
remove_project(
    project="<project_id_or_path>",
    purge_graphs=True,       # Deletes codebase-memory-mcp graph databases for all project repos
    delete_manifest=False    # Set to True if registry.yaml should also be deleted from disk
)
```
*Or via CLI: `npx oss-mcp remove <project_id_or_path> [--delete-manifest]`*

---

### 3. Verify Cleanup
Call `list_projects()` to confirm:
- The project is removed from `registered_projects`.
- The corresponding graphs no longer appear in `indexed_codebase_memory_graphs`.
