import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  mergeMcpConfig,
  unmergeMcpConfig,
  writeGuidelineFile,
  removeGuidelineSection,
  runAgentSetup,
  runAgentUninstall,
  runAgentUpdate,
} from "../src/agent-setup.js";

describe("Agent AI Setup Utilities", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-mcp-setup-test-"));
  });

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should merge MCP server config into new or existing JSON", () => {
    const configPath = path.join(tmpDir, "mcp.json");
    mergeMcpConfig(configPath);

    assert.ok(fs.existsSync(configPath));
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.ok(parsed.mcpServers["oss-mcp"]);
    assert.equal(parsed.mcpServers["oss-mcp"].command, "node");
    assert.ok(parsed.mcpServers["codebase-memory-mcp"]);
  });

  it("should unmerge MCP server config from JSON", () => {
    const configPath = path.join(tmpDir, "mcp-unmerge.json");
    mergeMcpConfig(configPath);

    const res = unmergeMcpConfig(configPath, "oss-mcp");
    assert.equal(res.removed, true);

    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.equal(parsed.mcpServers["oss-mcp"], undefined);
    assert.ok(parsed.mcpServers["codebase-memory-mcp"]);
  });

  it("should write and remove guideline markdown files properly", () => {
    const guidePath = path.join(tmpDir, "RULES.md");
    const res1 = writeGuidelineFile(guidePath, "# Initial Rule\nContent here", "Initial Rule");
    assert.equal(res1.updated, true);

    const res2 = writeGuidelineFile(guidePath, "# Initial Rule\nContent here", "Initial Rule");
    assert.equal(res2.updated, false); // Does not duplicate

    const removeRes = removeGuidelineSection(guidePath, "Initial Rule");
    assert.equal(removeRes.removed, true);
    assert.equal(fs.existsSync(guidePath), false); // Cleaned empty file
  });

  it("should run agent setup, update, and uninstall for all target agents", async () => {
    const testWs = path.join(tmpDir, "test-workspace");
    fs.mkdirSync(testWs, { recursive: true });

    // 1. Setup
    const setupResults = runAgentSetup("all", testWs, false);
    assert.ok(setupResults["Google Antigravity"]);
    assert.ok(setupResults["Claude (Desktop & Code)"]);
    assert.ok(setupResults["Cursor IDE"]);
    assert.ok(setupResults["OpenAI Codex"]);

    assert.ok(fs.existsSync(path.join(testWs, ".agents", "mcp_config.json")));
    assert.ok(fs.existsSync(path.join(testWs, ".cursor", "mcp.json")));
    assert.ok(fs.existsSync(path.join(testWs, ".codex", "config.json")));

    // 2. Update
    const updateResults = await runAgentUpdate("all", testWs, false);
    assert.ok(updateResults["Google Antigravity"]);
    assert.ok(updateResults["Cursor IDE"]);
    assert.ok(updateResults["GitHub & Core Package Update"]);

    // 3. Uninstall
    const uninstallResults = runAgentUninstall("all", testWs, false);
    assert.ok(uninstallResults["Google Antigravity"]);
    assert.ok(uninstallResults["Claude (Desktop & Code)"]);
    assert.ok(uninstallResults["Cursor IDE"]);
    assert.ok(uninstallResults["OpenAI Codex"]);

    // Verify oss-mcp unmerged
    const agyConfig = JSON.parse(fs.readFileSync(path.join(testWs, ".agents", "mcp_config.json"), "utf-8"));
    assert.equal(agyConfig.mcpServers["oss-mcp"], undefined);
  });
});
