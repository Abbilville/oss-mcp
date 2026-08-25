import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  readLocalRepoArtifact,
  scanGlobalCbmCache,
  listIndexedProjects,
  extractProjectsFromCbmOutput,
  getRepoIndexInfo,
  deriveCbmSlug,
} from "../src/indexer.js";

describe("Indexer Graph Detection", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-mcp-idx-test-"));
  });

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should detect and parse local .codebase-memory/artifact.json", () => {
    const fakeRepo = path.join(tmpDir, "fake-service");
    const cbmDir = path.join(fakeRepo, ".codebase-memory");
    fs.mkdirSync(cbmDir, { recursive: true });

    const artifact = {
      schema_version: 2,
      commit: "abcdef123456",
      indexed_at: "2026-08-25T12:00:00Z",
      project: "fake-service-proj",
      nodes: 500,
      edges: 1200,
      original_size: 1000000,
      compressed_size: 100000,
    };

    fs.writeFileSync(
      path.join(cbmDir, "artifact.json"),
      JSON.stringify(artifact, null, 2),
      "utf-8"
    );

    const detected = readLocalRepoArtifact(fakeRepo);
    assert.ok(detected);
    assert.equal(detected.name, "fake-service-proj");
    assert.equal(detected.project_id, "fake-service-proj");
    assert.equal(detected.nodes, 500);
    assert.equal(detected.edges, 1200);
    assert.equal(detected.is_indexed, true);
  });

  it("should return null for repos without .codebase-memory", () => {
    const unindexedRepo = path.join(tmpDir, "unindexed-service");
    fs.mkdirSync(unindexedRepo, { recursive: true });

    const detected = readLocalRepoArtifact(unindexedRepo);
    assert.equal(detected, null);
  });

  it("should scan global cache without throwing", () => {
    const cached = scanGlobalCbmCache();
    assert.ok(Array.isArray(cached));
  });

  it("should parse CLI structuredContent and text JSON outputs properly", () => {
    const rawCliOutput = JSON.stringify({
      structuredContent: {
        projects: [
          {
            name: "service-a",
            nodes: 100,
            edges: 250,
            root_path: "/path/to/service-a",
          },
        ],
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            projects: [
              {
                name: "service-a",
                nodes: 100,
                edges: 250,
              },
            ],
          }),
        },
      ],
    });

    const parsed = extractProjectsFromCbmOutput(`level=info msg=started\n${rawCliOutput}`, "");
    assert.ok(parsed.length >= 1);
    assert.equal(parsed[0].name, "service-a");
    assert.equal(parsed[0].nodes, 100);
    assert.equal(parsed[0].edges, 250);
  });

  it("should derive CBM slug and check repo index info", () => {
    const slug = deriveCbmSlug("C:\\Telkom\\test\\bank\\account-service");
    assert.equal(slug, "C-Telkom-test-bank-account-service");

    const info = getRepoIndexInfo("/non/existent/repo", "non-existent-repo", []);
    assert.equal(info.is_indexed, false);
    assert.equal(info.index_nodes, null);
  });
});
