---
name: oss-onboard
description: >-
  Automated multi-repo project onboarding, scanning, and batch indexing. Activate when
  setting up a new project workspace, scanning multiple microservices, generating
  a registry.yaml, or batch-indexing repositories into codebase-memory-mcp.
---

# Multi-Repo Onboarding & Batch Indexing Skill

This skill automates the discovery, manifest generation, and knowledge-graph indexing for any multi-repository project or microservices ecosystem.

---

## When to Activate

Activate this skill when:
- Onboarding a new multi-repo workspace or directory.
- The user asks to "scan this folder", "index these repositories", or "set up multi-repo for project X".
- Repositories in a project are found to be missing from `codebase-memory-mcp`.

---

## Onboarding Procedure

### Step 1: Discover & Scan Repositories
Scan the target directory containing sub-repositories:

```python
# In AI chat:
scan_and_create_registry(
    workspace_path="<target_directory_path>",
    output_file="<target_directory_path>/registry.yaml"
)
```
*Or via CLI: `npx oss-mcp scan <target_directory_path> -o <target_directory_path>/registry.yaml`*

**What this produces:**
- Discovers all sub-repositories (Node.js, Express, React, Python, FastAPI, Java, Go, etc.).
- Identifies entry points, configured ports, and tech stacks.
- Infers relationship edges (`api_call`, `depends_on`, `shared_resource`).

---

### Step 2: Review Generated Manifest
Inspect the generated `registry.yaml` overview. Check:
- Are all expected sub-repositories detected?
- Are ports and tech stacks accurate?
- Are inter-service API links mapped correctly?

---

### Step 3: Batch Index into `codebase-memory-mcp`
Index all discovered repositories in one step:

```python
# In AI chat:
index_project_repositories(
    project="<target_directory_path>/registry.yaml",
    mode="moderate"  # 'moderate' (recommended) or 'full' (all files + semantic)
)
```
*Or via CLI: `npx oss-mcp index --registry <path_to_registry.yaml>`*

---

### Step 4: Register the Project
Ensure the project is registered for future sessions:
- **Workspace-local**: Leave `registry.yaml` at the project root or `.agents/registry.yaml`.
- **Central Catalog**: Add entry to `data/projects.yaml` (or `~/.config/oss-mcp/projects.yaml`).
