/**
 * Automated multi-repo scanner and relationship discovery engine in JavaScript.
 *
 * Scans directories for repositories, infers tech stacks, entrypoints, ports,
 * and discovers relationships (API calls, dependencies, shared resources/ports).
 */

import fs from "node:fs";
import path from "node:path";
import { ProjectRegistry, RelationshipInfo, RepoInfo } from "./registry.js";

const NODE_LIB_MAP = {
  react: "React",
  "react-dom": "React",
  express: "Express",
  "@nestjs/core": "NestJS",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  "@angular/core": "Angular",
  sequelize: "Sequelize (PostgreSQL/MySQL)",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  typeorm: "TypeORM",
  mongoose: "Mongoose (MongoDB)",
  redis: "Redis",
  ioredis: "Redis",
  "firebase-admin": "Firebase Admin",
  firebase: "Firebase",
  "@aws-sdk/client-s3": "AWS SDK v3 (S3)",
  "aws-sdk": "AWS SDK",
  jsonwebtoken: "JWT",
  axios: "Axios",
  "@tanstack/react-query": "React Query (TanStack)",
  "react-query": "React Query",
  "@reduxjs/toolkit": "Redux Toolkit",
  redux: "Redux",
  "@mui/material": "MUI (Material UI)",
  tailwindcss: "Tailwind CSS",
  formik: "Formik",
  yup: "Yup",
  apexcharts: "ApexCharts",
  "chart.js": "Chart.js",
  winston: "Winston",
  "socket.io": "Socket.IO",
  "socket.io-client": "Socket.IO Client",
};

const PYTHON_LIB_MAP = {
  fastapi: "FastAPI",
  flask: "Flask",
  django: "Django",
  sqlalchemy: "SQLAlchemy",
  "tortoise-orm": "Tortoise ORM",
  redis: "Redis",
  celery: "Celery",
  pydantic: "Pydantic",
  alembic: "Alembic",
  httpx: "HTTPX",
  requests: "Requests",
  boto3: "AWS SDK (Boto3)",
  jwt: "PyJWT",
  langchain: "LangChain",
};

const IGNORED_DIRS = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".git",
  ".idea",
  ".mcp",
  ".mcp.json",
  ".venv",
  ".vscode",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "venv",
]);

function scanPackageJson(repoDir) {
  const pkgFile = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgFile) || !fs.statSync(pkgFile).isFile()) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
    const name = data.name || path.basename(repoDir);
    const dependencies = {
      ...(data.dependencies || {}),
      ...(data.devDependencies || {}),
    };

    const techStack = ["Node.js"];
    for (const [depKey, label] of Object.entries(NODE_LIB_MAP)) {
      if (dependencies[depKey]) {
        techStack.push(label);
      }
    }

    let entryPoint = data.main || "";
    if (!entryPoint) {
      const candidates = [
        "app.js",
        "server.js",
        "src/index.js",
        "src/index.ts",
        "src/index.tsx",
        "src/main.js",
        "src/main.ts",
        "src/main.tsx",
        "src/server.js",
        "src/server.ts",
        "src/app.js",
        "src/app.ts",
        "src/App.tsx",
        "index.js",
        "index.ts",
        "index.tsx",
      ];
      for (const cand of candidates) {
        if (fs.existsSync(path.join(repoDir, cand))) {
          entryPoint = cand;
          break;
        }
      }
    }

    return {
      name,
      techStack,
      entryPoint,
      description: data.description || "",
    };
  } catch {
    return null;
  }
}

function scanPythonDir(repoDir) {
  const reqFile = path.join(repoDir, "requirements.txt");
  const pyproject = path.join(repoDir, "pyproject.toml");
  const setupPy = path.join(repoDir, "setup.py");

  const hasPython =
    fs.existsSync(reqFile) || fs.existsSync(pyproject) || fs.existsSync(setupPy);
  if (!hasPython) return null;

  const techStack = ["Python"];
  let content = "";
  if (fs.existsSync(reqFile)) {
    try {
      content += fs.readFileSync(reqFile, "utf-8").toLowerCase();
    } catch { }
  }
  if (fs.existsSync(pyproject)) {
    try {
      content += fs.readFileSync(pyproject, "utf-8").toLowerCase();
    } catch { }
  }

  for (const [depKey, label] of Object.entries(PYTHON_LIB_MAP)) {
    if (content.includes(depKey)) {
      techStack.push(label);
    }
  }

  let entryPoint = "";
  const candidates = [
    "main.py",
    "app.py",
    "src/main.py",
    "app/main.py",
    "app/api.py",
    "src/app/main.py",
    "manage.py",
    "wsgi.py",
  ];
  for (const cand of candidates) {
    if (fs.existsSync(path.join(repoDir, cand))) {
      entryPoint = cand;
      break;
    }
  }

  return {
    name: path.basename(repoDir),
    techStack,
    entryPoint,
    description: "",
  };
}

function scanJavaDir(repoDir) {
  const pomFile = path.join(repoDir, "pom.xml");
  const gradleFile = path.join(repoDir, "build.gradle");
  const gradleKts = path.join(repoDir, "build.gradle.kts");

  if (!fs.existsSync(pomFile) && !fs.existsSync(gradleFile) && !fs.existsSync(gradleKts)) {
    return null;
  }

  const techStack = ["Java"];
  if (fs.existsSync(pomFile)) techStack.push("Maven");
  if (fs.existsSync(gradleFile) || fs.existsSync(gradleKts)) techStack.push("Gradle");

  let content = "";
  try {
    if (fs.existsSync(pomFile)) content += fs.readFileSync(pomFile, "utf-8");
    if (fs.existsSync(gradleFile)) content += fs.readFileSync(gradleFile, "utf-8");
  } catch { }

  if (content.toLowerCase().includes("spring-boot")) {
    techStack.push("Spring Boot");
  }

  return {
    name: path.basename(repoDir),
    techStack,
    entryPoint: "src/main/java",
    description: "",
  };
}

function scanGoDir(repoDir) {
  const goMod = path.join(repoDir, "go.mod");
  if (!fs.existsSync(goMod)) return null;

  const techStack = ["Go"];
  let content = "";
  try {
    content = fs.readFileSync(goMod, "utf-8").toLowerCase();
  } catch { }

  if (content.includes("gin-gonic/gin")) techStack.push("Gin");
  if (content.includes("gofiber/fiber")) techStack.push("Fiber");
  if (content.includes("labstack/echo")) techStack.push("Echo");

  return {
    name: path.basename(repoDir),
    techStack,
    entryPoint: "main.go",
    description: "",
  };
}

function inferPort(repoDir) {
  // 1. Check .env files
  const envFiles = [".env", ".env.local", ".env.development", ".env.example"];
  for (const envFile of envFiles) {
    const fullPath = path.join(repoDir, envFile);
    if (fs.existsSync(fullPath)) {
      try {
        const text = fs.readFileSync(fullPath, "utf-8");
        const match = text.match(/(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*(\d{2,5})/i);
        if (match) {
          const p = parseInt(match[1], 10);
          if (p > 0 && p < 65536) return p;
        }
      } catch { }
    }
  }

  // 2. Scan entry point, config, or main code files for port numbers
  const filesToScan = [
    "app.js",
    "server.js",
    "index.js",
    "src/index.js",
    "src/server.js",
    "app.ts",
    "server.ts",
    "index.ts",
    "src/index.ts",
    "src/server.ts",
    "src/main.ts",
    "vite.config.ts",
    "vite.config.js",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "main.py",
    "app/main.py",
    "main.go",
    "cmd/main.go",
    "src/main.go",
    "application.properties",
    "application.yml",
    "application.yaml",
    "src/main/resources/application.properties",
    "src/main/resources/application.yml",
    "src/main/resources/application.yaml",
  ];
  for (const file of filesToScan) {
    const fullPath = path.join(repoDir, file);
    if (fs.existsSync(fullPath)) {
      try {
        const text = fs.readFileSync(fullPath, "utf-8");
        const match =
          text.match(/(?:port|listen)\s*[:=(]\s*(?:process\.env\.PORT\s*\|\|\s*)?(\d{2,5})/i) ||
          text.match(/(?:Run|Listen|ListenAndServe)\s*\(\s*["']:?(\d{2,5})["']/i) ||
          text.match(/EXPOSE\s+(\d{2,5})/i) ||
          text.match(/["']?(\d{2,5}):(\d{2,5})["']?/) ||
          text.match(/(?:server\.port|port)\s*[:=]\s*(\d{2,5})/i);
        if (match) {
          const p = parseInt(match[1], 10);
          if (p > 80 && p < 65536) return p;
        }
      } catch { }
    }
  }
  return null;
}

function collectRepoCodeText(repoPath, maxDepth = 3) {
  let combined = "";
  const codeExtRegex = /\.(js|ts|jsx|tsx|py|json|env|yaml|yml|properties|go|java)$/;

  function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth || !fs.existsSync(currentDir)) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(currentDir, entry.name);
        if (entry.isFile() && codeExtRegex.test(entry.name)) {
          try {
            // Limit file size to 256KB to avoid massive files slowing scan
            const stat = fs.statSync(full);
            if (stat.size < 256 * 1024) {
              combined += fs.readFileSync(full, "utf-8") + "\n";
            }
          } catch {}
        } else if (entry.isDirectory() && currentDepth < maxDepth) {
          walk(full, currentDepth + 1);
        }
      }
    } catch {}
  }

  walk(repoPath, 1);
  return combined;
}

function inferRelationships(repos, workspacePath) {
  const relationships = [];
  const repoNames = repos.map((r) => r.name);
  const repoPortMap = new Map();

  for (const r of repos) {
    if (r.port) {
      repoPortMap.set(r.port, r.name);
    }
  }

  for (const repo of repos) {
    if (!repo.local_path || !fs.existsSync(repo.local_path)) continue;

    // Check if this repo calls other repos via port or name
    const combinedContent = collectRepoCodeText(repo.local_path);

    // Check port connections
    for (const [targetPort, targetName] of repoPortMap.entries()) {
      if (targetName === repo.name) continue;
      if (combinedContent.includes(String(targetPort)) || combinedContent.includes(`:${targetPort}`)) {
        relationships.push(
          new RelationshipInfo({
            source: repo.name,
            target: targetName,
            type: "api_call",
            description: `${repo.name} communicates with ${targetName} on port ${targetPort}`,
          })
        );
      }
    }

    // Check frontend-to-backend conventions
    const isFrontend =
      repo.tech_stack.includes("React") ||
      repo.tech_stack.includes("Vue") ||
      repo.tech_stack.includes("Angular") ||
      repo.tech_stack.includes("Next.js") ||
      repo.name.toLowerCase().includes("fe") ||
      repo.name.toLowerCase().includes("frontend");

    if (isFrontend) {
      for (const target of repos) {
        if (target.name === repo.name) continue;
        const isBackend =
          target.tech_stack.includes("Express") ||
          target.tech_stack.includes("FastAPI") ||
          target.tech_stack.includes("Django") ||
          target.tech_stack.includes("Spring Boot") ||
          target.tech_stack.includes("NestJS") ||
          target.tech_stack.includes("Gin") ||
          target.name.toLowerCase().includes("be") ||
          target.name.toLowerCase().includes("backend") ||
          target.name.toLowerCase().includes("api");

        if (isBackend) {
          const alreadyExists = relationships.some(
            (rel) => rel.source === repo.name && rel.target === target.name
          );
          if (!alreadyExists) {
            relationships.push(
              new RelationshipInfo({
                source: repo.name,
                target: target.name,
                type: "api_call",
                description: `${repo.name} invokes REST/GraphQL endpoints on ${target.name}`,
              })
            );
            relationships.push(
              new RelationshipInfo({
                source: repo.name,
                target: target.name,
                type: "depends_on",
                description: `${repo.name} depends on ${target.name} for authentication state and data contracts`,
              })
            );
          }
        }
      }
    }
  }

  return relationships;
}

export function scanWorkspace(targetDir, projectId = null) {
  const resolvedDir = path.resolve(targetDir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Workspace directory not found: ${resolvedDir}`);
  }

  const repos = [];
  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });

  // 1. Check if the directory itself is a single repo
  const selfNode = scanPackageJson(resolvedDir);
  const selfPython = scanPythonDir(resolvedDir);
  const selfJava = scanJavaDir(resolvedDir);
  const selfGo = scanGoDir(resolvedDir);
  const selfMatch = selfNode || selfPython || selfJava || selfGo;

  // 2. Scan subdirectories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const subDir = path.join(resolvedDir, entry.name);
    let repoData =
      scanPackageJson(subDir) ||
      scanPythonDir(subDir) ||
      scanJavaDir(subDir) ||
      scanGoDir(subDir);

    if (repoData) {
      const port = inferPort(subDir);
      repos.push(
        new RepoInfo({
          name: repoData.name || entry.name,
          local_path: subDir.replace(/\\/g, "/"),
          description: repoData.description || `Service ${entry.name}`,
          tech_stack: repoData.techStack,
          entry_point: repoData.entryPoint,
          port,
        })
      );
    }
  }

  // If no sub-repos found but root is a repo, add root
  if (repos.length === 0 && selfMatch) {
    repos.push(
      new RepoInfo({
        name: selfMatch.name || path.basename(resolvedDir),
        local_path: resolvedDir.replace(/\\/g, "/"),
        description: selfMatch.description || "Root Service",
        tech_stack: selfMatch.techStack,
        entry_point: selfMatch.entryPoint,
        port: inferPort(resolvedDir),
      })
    );
  }

  const relationships = inferRelationships(repos, resolvedDir);
  const pId = projectId || path.basename(resolvedDir);

  return new ProjectRegistry({
    project_id: pId,
    name: `${pId} Ecosystem`,
    description: `Auto-scanned multi-repo project at ${resolvedDir}`,
    repos,
    relationships,
    source_path: path.join(resolvedDir, "registry.yaml"),
  });
}
