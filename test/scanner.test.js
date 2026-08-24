import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { scanWorkspace } from "../src/scanner.js";

describe("Scanner Engine", () => {
  let tmpWorkspace;

  before(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "oss-mcp-scan-test-"));

    // 1. Create a Node.js + Express backend service
    const beDir = path.join(tmpWorkspace, "backend-service");
    fs.mkdirSync(beDir, { recursive: true });
    fs.writeFileSync(
      path.join(beDir, "package.json"),
      JSON.stringify(
        {
          name: "backend-service",
          main: "src/server.js",
          dependencies: {
            express: "^4.18.2",
            jsonwebtoken: "^9.0.0",
            redis: "^4.6.7",
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(beDir, ".env"), "PORT=4000\nNODE_ENV=production\n");

    // 2. Create a React + Vite frontend service
    const feDir = path.join(tmpWorkspace, "frontend-app");
    fs.mkdirSync(feDir, { recursive: true });
    fs.writeFileSync(
      path.join(feDir, "package.json"),
      JSON.stringify(
        {
          name: "frontend-app",
          main: "src/main.tsx",
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
            axios: "^1.4.0",
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(feDir, ".env"), "PORT=3000\nVITE_API_URL=http://localhost:4000\n");

    // 3. Create a Python FastAPI service
    const pyDir = path.join(tmpWorkspace, "ml-service");
    fs.mkdirSync(pyDir, { recursive: true });
    fs.writeFileSync(
      path.join(pyDir, "requirements.txt"),
      "fastapi==0.100.0\nuvicorn==0.22.0\npydantic==2.0\n"
    );
    fs.writeFileSync(
      path.join(pyDir, "main.py"),
      'import uvicorn\nif __name__ == "__main__":\n    uvicorn.run(port=8000)\n'
    );

    // 4. Create a Go Gin service
    const goDir = path.join(tmpWorkspace, "gateway-service");
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(
      path.join(goDir, "go.mod"),
      "module github.com/test/gateway\n\ngo 1.20\n\nrequire github.com/gin-gonic/gin v1.9.1\n"
    );
    fs.writeFileSync(
      path.join(goDir, "main.go"),
      'package main\nfunc main() {\n  r := gin.Default()\n  r.Run(":8080")\n}\n'
    );
  });

  after(() => {
    if (fs.existsSync(tmpWorkspace)) {
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    }
  });

  it("should discover all microservices across different stacks", () => {
    const registry = scanWorkspace(tmpWorkspace, "test-workspace");

    assert.equal(registry.project_id, "test-workspace");
    assert.equal(registry.repos.length, 4);

    const names = registry.repos.map((r) => r.name).sort();
    assert.deepEqual(names, [
      "backend-service",
      "frontend-app",
      "gateway-service",
      "ml-service",
    ]);

    // Check Node.js backend
    const be = registry.getRepo("backend-service");
    assert.ok(be);
    assert.equal(be.port, 4000);
    assert.ok(be.tech_stack.includes("Node.js"));
    assert.ok(be.tech_stack.includes("Express"));
    assert.ok(be.tech_stack.includes("JWT"));
    assert.ok(be.tech_stack.includes("Redis"));

    // Check Frontend
    const fe = registry.getRepo("frontend-app");
    assert.ok(fe);
    assert.equal(fe.port, 3000);
    assert.ok(fe.tech_stack.includes("React"));
    assert.ok(fe.tech_stack.includes("Axios"));

    // Check Python
    const py = registry.getRepo("ml-service");
    assert.ok(py);
    assert.equal(py.port, 8000);
    assert.ok(py.tech_stack.includes("Python"));
    assert.ok(py.tech_stack.includes("FastAPI"));
    assert.ok(py.tech_stack.includes("Pydantic"));

    // Check Go
    const go = registry.getRepo("gateway-service");
    assert.ok(go);
    assert.equal(go.port, 8080);
    assert.ok(go.tech_stack.includes("Go"));
    assert.ok(go.tech_stack.includes("Gin"));
  });

  it("should infer communication and dependency relationships between services", () => {
    const registry = scanWorkspace(tmpWorkspace, "test-workspace");

    // Frontend calls backend (due to port 4000 in frontend .env and frontend-to-backend heuristic)
    const feCalls = registry.relationships.filter(
      (rel) => rel.source === "frontend-app" && rel.target === "backend-service"
    );

    assert.ok(feCalls.length > 0, "Frontend should have relationship with backend");
    assert.ok(feCalls.some((r) => r.type === "api_call"));
  });
});
