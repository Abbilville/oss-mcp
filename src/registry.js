/**
 * Registry models and dynamic multi-project resolution engine.
 *
 * Supports loading repo manifests and relationship graphs from:
 * 1. Explicit project ID lookup via projects catalog (data/projects.yaml or ~/.config/oss-mcp/projects.yaml)
 * 2. Explicit path parameter
 * 3. Environment variables (MCP_REGISTRY_PATH / REPO_REGISTRY_PATH)
 * 4. Workspace auto-discovery (walking up CWD for registry.yaml / .repo-registry.yaml)
 * 5. Default fallback (oss-mcp/data/registry.yaml)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base paths
const PACKAGE_DIR = __dirname;
const PROJECT_ROOT = path.resolve(PACKAGE_DIR, "..");
const DEFAULT_REGISTRY = path.join(PROJECT_ROOT, "data", "registry.yaml");
const DEFAULT_PROJECTS_CATALOG = path.join(PROJECT_ROOT, "data", "projects.yaml");
const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "oss-mcp");
const USER_PROJECTS_CATALOG = path.join(USER_CONFIG_DIR, "projects.yaml");

export class RepoInfo {
  constructor({
    name,
    owner = "unknown",
    local_path = "",
    description = "",
    tech_stack = [],
    entry_point = "",
    port = null,
    tags = [],
  }) {
    this.name = name;
    this.owner = owner;
    this.local_path = local_path;
    this.description = description;
    this.tech_stack = Array.isArray(tech_stack) ? tech_stack : [];
    this.entry_point = entry_point;
    this.port = port !== undefined && port !== null ? Number(port) : null;
    this.tags = Array.isArray(tags) ? tags : [];
  }

  toDict() {
    const data = {
      name: this.name,
      owner: this.owner,
      local_path: this.local_path,
      description: this.description,
      tech_stack: this.tech_stack,
      entry_point: this.entry_point,
      tags: this.tags,
    };
    if (this.port !== null && !isNaN(this.port)) {
      data.port = this.port;
    }
    return data;
  }
}

export class RelationshipInfo {
  constructor({
    source,
    target,
    type = "depends_on",
    description = "",
    metadata = {},
  }) {
    this.source = source;
    this.target = target;
    this.type = type; // api_call, depends_on, shared_resource, event_stream, submodule
    this.description = description;
    this.metadata = metadata || {};
  }

  toDict() {
    const data = {
      source: this.source,
      target: this.target,
      type: this.type,
      description: this.description,
    };
    if (this.metadata && Object.keys(this.metadata).length > 0) {
      data.metadata = this.metadata;
    }
    return data;
  }
}

export class ProjectRegistry {
  constructor({
    project_id,
    name = "",
    description = "",
    repos = [],
    relationships = [],
    source_path = null,
  }) {
    this.project_id = project_id;
    this.name = name || project_id;
    this.description = description;
    this.repos = repos.map((r) => (r instanceof RepoInfo ? r : new RepoInfo(r)));
    this.relationships = relationships.map((rel) =>
      rel instanceof RelationshipInfo ? rel : new RelationshipInfo(rel)
    );
    this.source_path = source_path;
  }

  getRepo(name) {
    if (!name) return null;
    const target = name.toLowerCase();
    return this.repos.find((r) => r.name && r.name.toLowerCase() === target) || null;
  }

  getInboundRelationships(repoName) {
    if (!repoName) return [];
    const target = repoName.toLowerCase();
    return this.relationships.filter(
      (rel) => rel.target && rel.target.toLowerCase() === target
    );
  }

  getOutboundRelationships(repoName) {
    if (!repoName) return [];
    const target = repoName.toLowerCase();
    return this.relationships.filter(
      (rel) => rel.source && rel.source.toLowerCase() === target
    );
  }

  toOverviewDict() {
    return {
      project_id: this.project_id,
      project_name: this.name || this.project_id,
      description: this.description,
      source_path: this.source_path ? String(this.source_path) : null,
      repos: this.repos.map((r) => ({
        name: r.name,
        owner: r.owner,
        local_path: r.local_path,
        description: r.description,
        tech_stack: r.tech_stack,
        entry_point: r.entry_point,
        port: r.port,
      })),
      relationships: this.relationships.map((rel) => ({
        source: rel.source,
        target: rel.target,
        type: rel.type,
        description: rel.description,
      })),
    };
  }

  toYamlDict() {
    return {
      project_id: this.project_id,
      name: this.name,
      description: this.description,
      repos: this.repos.map((r) => r.toDict()),
      relationships: this.relationships.map((rel) => rel.toDict()),
    };
  }
}

function discoverWorkspaceRegistry(startDir = null) {
  let current = path.resolve(startDir || process.cwd());
  const candidateNames = [
    "registry.yaml",
    "registry.yml",
    ".repo-registry.yaml",
    ".repo-registry.yml",
    ".agents/registry.yaml",
    ".agents/registry.yml",
    "data/registry.yaml",
    "data/registry.yml",
  ];

  while (true) {
    for (const candidate of candidateNames) {
      const candidatePath = path.join(current, candidate);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return path.resolve(candidatePath);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function getProjectsCatalog() {
  const catalogPaths = [
    process.env.MCP_PROJECTS_CATALOG,
    USER_PROJECTS_CATALOG,
    DEFAULT_PROJECTS_CATALOG,
  ].filter(Boolean);

  for (const cPath of catalogPaths) {
    if (fs.existsSync(cPath) && fs.statSync(cPath).isFile()) {
      try {
        const content = fs.readFileSync(cPath, "utf-8");
        const data = yaml.load(content);
        if (data && typeof data === "object" && data.projects) {
          return data.projects;
        }
      } catch (err) {
        console.warn(`[WARN] Failed to load projects catalog from ${cPath}:`, err.message);
      }
    }
  }
  return {};
}

export function unregisterProjectFromCatalog(projectId) {
  const catalogPaths = [
    process.env.MCP_PROJECTS_CATALOG,
    USER_PROJECTS_CATALOG,
    DEFAULT_PROJECTS_CATALOG,
  ].filter(Boolean);

  let removed = false;
  for (const cPath of catalogPaths) {
    if (fs.existsSync(cPath) && fs.statSync(cPath).isFile()) {
      try {
        const content = fs.readFileSync(cPath, "utf-8");
        const data = yaml.load(content) || {};
        if (data && typeof data === "object" && data.projects && data.projects[projectId]) {
          delete data.projects[projectId];
          fs.writeFileSync(cPath, yaml.dump(data, { indent: 2 }), "utf-8");
          removed = true;
        }
      } catch (err) {
        console.warn(`[WARN] Failed to update projects catalog at ${cPath}:`, err.message);
      }
    }
  }
  return removed;
}

export function listAvailableProjects() {
  const catalog = getProjectsCatalog();
  const projects = [];

  for (const [pid, info] of Object.entries(catalog)) {
    projects.push({
      project_id: pid,
      name: info.name || pid,
      description: info.description || "",
      registry_path: info.registry_path || "",
      root_path: info.root_path || "",
    });
  }

  if (fs.existsSync(DEFAULT_REGISTRY) && fs.statSync(DEFAULT_REGISTRY).isFile()) {
    if (!projects.some((p) => p.project_id === "oss" || p.project_id === "sample-project")) {
      projects.push({
        project_id: "default",
        name: "Default Sample Project",
        description: "Default multi-repo registry in oss-mcp/data/registry.yaml",
        registry_path: DEFAULT_REGISTRY,
        root_path: PROJECT_ROOT,
      });
    }
  }

  return projects;
}

export function resolveRegistryPath(target = null) {
  // 1. Direct file path
  if (target) {
    const targetPath = path.resolve(String(target));
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      return targetPath;
    }

    // Direct lookup in projects catalog
    const catalog = getProjectsCatalog();
    if (catalog[String(target)]) {
      const regPath = catalog[String(target)].registry_path;
      if (regPath) {
        const resolvedReg = path.isAbsolute(regPath)
          ? regPath
          : path.resolve(PROJECT_ROOT, regPath);
        if (fs.existsSync(resolvedReg) && fs.statSync(resolvedReg).isFile()) {
          return resolvedReg;
        }
      }
    }
  }

  // 2. Environment variable
  const envPath = process.env.MCP_REGISTRY_PATH || process.env.REPO_REGISTRY_PATH;
  if (envPath) {
    const resolvedEnv = path.resolve(envPath);
    if (fs.existsSync(resolvedEnv) && fs.statSync(resolvedEnv).isFile()) {
      return resolvedEnv;
    }
  }

  // 3. Workspace traversal
  const workspacePath = discoverWorkspaceRegistry();
  if (workspacePath && fs.existsSync(workspacePath)) {
    return workspacePath;
  }

  // 4. Default fallback
  if (fs.existsSync(DEFAULT_REGISTRY) && fs.statSync(DEFAULT_REGISTRY).isFile()) {
    return path.resolve(DEFAULT_REGISTRY);
  }

  throw new Error(
    "Could not resolve any registry.yaml. Provide a path, set MCP_REGISTRY_PATH, or run `npx oss-mcp setup`."
  );
}

export function loadRegistry(target = null) {
  const registryPath = resolveRegistryPath(target);
  const content = fs.readFileSync(registryPath, "utf-8");
  const raw = yaml.load(content);

  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid registry format in ${registryPath}: expected YAML mapping`);
  }

  const projectId = raw.project_id || path.basename(registryPath, path.extname(registryPath));
  const projectName = raw.name || projectId;
  const description = raw.description || "";

  const repos = (raw.repos || []).map((r) => new RepoInfo(r));
  const relationships = (raw.relationships || []).map((rel) => new RelationshipInfo(rel));

  return new ProjectRegistry({
    project_id: projectId,
    name: projectName,
    description,
    repos,
    relationships,
    source_path: registryPath,
  });
}

export function saveRegistry(registry, outputPath) {
  const resolvedOut = path.resolve(outputPath);
  const parentDir = path.dirname(resolvedOut);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const yamlStr = yaml.dump(registry.toYamlDict(), { indent: 2, lineWidth: -1 });
  fs.writeFileSync(resolvedOut, yamlStr, "utf-8");
  return resolvedOut;
}
