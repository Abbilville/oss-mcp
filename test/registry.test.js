import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  RepoInfo,
  RelationshipInfo,
  ProjectRegistry,
  loadRegistry,
  saveRegistry,
  listAvailableProjects,
  getProjectsCatalog,
} from "../src/registry.js";

describe("Registry Data Models", () => {
  it("should create and serialize RepoInfo properly", () => {
    const repo = new RepoInfo({
      name: "auth-service",
      owner: "security-team",
      local_path: "./services/auth",
      description: "Handles JWT tokens",
      tech_stack: ["Node.js", "Express", "JWT"],
      entry_point: "src/server.js",
      port: 4000,
      tags: ["auth", "backend"],
    });

    assert.equal(repo.name, "auth-service");
    assert.equal(repo.port, 4000);
    assert.deepEqual(repo.tech_stack, ["Node.js", "Express", "JWT"]);

    const dict = repo.toDict();
    assert.equal(dict.name, "auth-service");
    assert.equal(dict.port, 4000);
    assert.deepEqual(dict.tags, ["auth", "backend"]);
  });

  it("should create and serialize RelationshipInfo properly", () => {
    const rel = new RelationshipInfo({
      source: "web-ui",
      target: "auth-service",
      type: "api_call",
      description: "Calls /login endpoint",
      metadata: { protocol: "https" },
    });

    assert.equal(rel.source, "web-ui");
    assert.equal(rel.target, "auth-service");
    assert.equal(rel.type, "api_call");

    const dict = rel.toDict();
    assert.equal(dict.source, "web-ui");
    assert.equal(dict.metadata.protocol, "https");
  });

  it("should correctly manage repos and inbound/outbound relationships in ProjectRegistry", () => {
    const repoA = new RepoInfo({ name: "frontend", port: 3000 });
    const repoB = new RepoInfo({ name: "backend", port: 4000 });
    const repoC = new RepoInfo({ name: "database", port: 5432 });

    const rel1 = new RelationshipInfo({ source: "frontend", target: "backend", type: "api_call" });
    const rel2 = new RelationshipInfo({ source: "backend", target: "database", type: "depends_on" });

    const registry = new ProjectRegistry({
      project_id: "test-eco",
      name: "Test Ecosystem",
      repos: [repoA, repoB, repoC],
      relationships: [rel1, rel2],
    });

    assert.equal(registry.repos.length, 3);
    assert.equal(registry.getRepo("backend").port, 4000);
    assert.equal(registry.getRepo("non-existent"), null);

    // Inbound to backend -> from frontend
    const inboundBackend = registry.getInboundRelationships("backend");
    assert.equal(inboundBackend.length, 1);
    assert.equal(inboundBackend[0].source, "frontend");

    // Outbound from backend -> to database
    const outboundBackend = registry.getOutboundRelationships("backend");
    assert.equal(outboundBackend.length, 1);
    assert.equal(outboundBackend[0].target, "database");

    const overview = registry.toOverviewDict();
    assert.equal(overview.project_id, "test-eco");
    assert.equal(overview.repos.length, 3);
    assert.equal(overview.relationships.length, 2);
  });
});

describe("Registry Persistence & Resolution", () => {
  let tmpDir;
  let tmpRegistryFile;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-mcp-reg-test-"));
    tmpRegistryFile = path.join(tmpDir, "registry.yaml");
  });

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should save and load registry from file", () => {
    const repo = new RepoInfo({
      name: "payment-api",
      local_path: "./services/payment",
      tech_stack: ["Go", "Gin"],
      port: 8080,
    });

    const registry = new ProjectRegistry({
      project_id: "fintech",
      name: "FinTech Platform",
      description: "Payment processing stack",
      repos: [repo],
      relationships: [],
    });

    const savedPath = saveRegistry(registry, tmpRegistryFile);
    assert.equal(fs.existsSync(savedPath), true);

    const loaded = loadRegistry(savedPath);
    assert.equal(loaded.project_id, "fintech");
    assert.equal(loaded.name, "FinTech Platform");
    assert.equal(loaded.repos.length, 1);
    assert.equal(loaded.repos[0].name, "payment-api");
    assert.equal(loaded.repos[0].port, 8080);
    assert.deepEqual(loaded.repos[0].tech_stack, ["Go", "Gin"]);
  });

  it("should list available projects including fallback/catalogs", () => {
    const projects = listAvailableProjects();
    assert.equal(Array.isArray(projects), true);
  });

  it("should resolve registry path when pointing to directory containing registry.yaml", () => {
    const loadedFromDir = loadRegistry(tmpDir);
    assert.equal(loadedFromDir.project_id, "fintech");
  });
});
