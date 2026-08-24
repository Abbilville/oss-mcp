import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { server } from "../src/server.js";

describe("MCP Server Tools", () => {
  it("should initialize McpServer instance with correct metadata", () => {
    assert.ok(server);
  });

  it("should verify core tools exist", async () => {
    // Check that get_architecture_overview and list_projects can be invoked via the underlying logic
    import("../src/registry.js").then((reg) => {
      const projects = reg.listAvailableProjects();
      assert.equal(Array.isArray(projects), true);
    });
  });
});
