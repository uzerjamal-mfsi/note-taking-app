#!/usr/bin/env node
// Validates the Claude Code / SDD workflow scaffolding. No dependencies.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const errors = [];
const fail = (msg) => errors.push(msg);

const VALID_TOOLS = new Set([
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "LS",
  "MultiEdit",
  "NotebookEdit",
  "NotebookRead",
  "Read",
  "Task",
  "Agent",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write",
]);
const READ_ONLY_AGENTS = ["code-reviewer", "spec-reviewer"];
const WRITE_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

const requiredFiles = [
  ".claude/agents/test-writer.md",
  ".claude/agents/e2e-test-writer.md",
  ".claude/agents/code-reviewer.md",
  ".claude/agents/spec-reviewer.md",
  ".claude/commands/sdd.md",
  "AGENTS.md",
  "docs/requirements/FRS.md",
  "docs/architecture/SDS.md",
  "docs/development/sdd-workflow.md",
  "apps/api/CLAUDE.md",
  "apps/web/CLAUDE.md",
  "packages/shared/CLAUDE.md",
];

for (const rel of requiredFiles) {
  if (!existsSync(join(root, rel))) fail(`Missing required file: ${rel}`);
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return data;
}

function parseTools(value) {
  const v = value.trim().replace(/^\[|\]$/g, "");
  return v
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const agentsDir = join(root, ".claude/agents");
if (existsSync(agentsDir)) {
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const rel = `.claude/agents/${file}`;
    const name = basename(file, ".md");
    const fm = parseFrontmatter(readFileSync(join(agentsDir, file), "utf8"));
    if (!fm) {
      fail(`${rel}: missing YAML frontmatter`);
      continue;
    }
    if (fm.name !== name) fail(`${rel}: frontmatter name "${fm.name ?? ""}" must equal "${name}"`);
    if (!fm.description) fail(`${rel}: description must be non-empty`);
    if (fm.tools !== undefined) {
      const tools = parseTools(fm.tools);
      for (const t of tools) {
        // mcp__* tools are allowed; everything else must be known.
        if (!VALID_TOOLS.has(t) && !t.startsWith("mcp__")) fail(`${rel}: unknown tool "${t}"`);
      }
      if (READ_ONLY_AGENTS.includes(name)) {
        for (const t of tools) {
          if (WRITE_TOOLS.includes(t)) fail(`${rel}: reviewer must not have tool "${t}"`);
        }
      }
    } else if (READ_ONLY_AGENTS.includes(name)) {
      fail(`${rel}: reviewer must declare an explicit read-only "tools" list`);
    }
  }
}

const settingsPath = join(root, ".claude/settings.json");
if (!existsSync(settingsPath)) {
  fail("Missing .claude/settings.json");
} else {
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch (e) {
    fail(`.claude/settings.json is not valid JSON: ${e.message}`);
  }
  if (settings) {
    for (const groups of Object.values(settings.hooks ?? {})) {
      for (const group of groups) {
        for (const hook of group.hooks ?? []) {
          const cmd = hook.command ?? "";
          const m = /(?:\$CLAUDE_PROJECT_DIR\/|\.\/)?(\.claude\/hooks\/[\w.-]+)/.exec(cmd);
          if (m && !existsSync(join(root, m[1]))) fail(`Hook script not found: ${m[1]}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`validate:workflow failed with ${errors.length} problem(s):\n`);
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.exit(1);
}
process.stdout.write("validate:workflow OK\n");
