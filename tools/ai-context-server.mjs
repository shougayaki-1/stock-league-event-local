#!/usr/bin/env node

/**
 * Read-only, dependency-free MCP-compatible context server for coding agents.
 *
 * It intentionally exposes documentation only. It never reads .env/data,
 * never touches Firebase, and never provides mutation tools.
 */
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const protocolVersion = "2025-11-25";

const resources = [
  ["stock-league://ai/README", "docs/ai/README.md", "text/markdown", "AI context pack entry point"],
  ["stock-league://ai/concepts", "docs/ai/concepts.md", "text/markdown", "Domain concepts and invariants"],
  ["stock-league://ai/screens", "docs/ai/screens.md", "text/markdown", "Route-by-route screen guide"],
  ["stock-league://ai/operations", "docs/ai/operations.md", "text/markdown", "Operator workflows and safety"],
  ["stock-league://ai/data-model", "docs/ai/data-model.md", "text/markdown", "Firestore collections and document shapes"],
  ["stock-league://ai/troubleshooting", "docs/ai/troubleshooting.md", "text/markdown", "Failure diagnosis and recovery"],
  ["stock-league://ai/prompts", "docs/ai/prompts.md", "text/markdown", "Reusable prompts for AI operators"],
  ["stock-league://ai/manifest", "docs/ai/manifest.json", "application/json", "Machine-readable application manifest"],
  ["stock-league://ai/mcp", "docs/ai/mcp.md", "text/markdown", "MCP-compatible context server contract"],
];

const prompts = [
  {
    name: "orient",
    title: "Orient an AI to the application",
    description: "Load the context pack and summarize actors, routes, risks, and the requested goal before acting.",
    arguments: [{ name: "goal", description: "What the human wants to accomplish", required: true }],
  },
  {
    name: "operate-event",
    title: "Prepare or operate an event",
    description: "Plan an event operation without performing destructive actions implicitly.",
    arguments: [{ name: "phase", description: "prepare, run, incident, or close", required: true }],
  },
  {
    name: "review-change",
    title: "Review a code or configuration change",
    description: "Check auth boundaries, data invariants, local-only constraints, and verification steps.",
    arguments: [{ name: "change", description: "Description of the proposed change", required: true }],
  },
  {
    name: "troubleshoot",
    title: "Troubleshoot a local deployment",
    description: "Diagnose a Docker/browser/emulator symptom using observable evidence before proposing changes.",
    arguments: [{ name: "symptom", description: "Observed symptom or error", required: true }],
  },
];

const promptText = {
  orient: (args) => `You are operating Stock League Event Local. First read the resources stock-league://ai/README, stock-league://ai/concepts, stock-league://ai/screens, and stock-league://ai/operations. Human goal: ${args.goal || "(not provided)"}. Summarize the relevant actor, route, data, risks, and a verification plan. Do not mutate data or run destructive actions without explicit confirmation.`,
  "operate-event": (args) => `Use the Stock League Event Local context pack. Event phase: ${args.phase || "(not provided)"}. Produce a checklist using operations.md. Separate read-only checks, reversible actions, and destructive actions. Ask for confirmation immediately before any reset, finalization, deletion, or emergency market action.`,
  "review-change": (args) => `Review this proposed change against the Stock League Event Local invariants in concepts.md, data-model.md, and AGENTS.md: ${args.change || "(not provided)"}. Report affected actors/routes/collections, security and local-only risks, migration needs, and concrete verification commands.`,
  troubleshoot: (args) => `Troubleshoot Stock League Event Local using troubleshooting.md. Symptom: ${args.symptom || "(not provided)"}. Ask only for evidence that cannot be obtained locally, distinguish browser cache/auth issues from emulator/data issues, and avoid deleting data as a first step.`,
};

function response(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

async function readResource(uri) {
  const entry = resources.find(([candidate]) => candidate === uri);
  if (!entry) throw new Error(`Unknown resource: ${uri}`);
  const target = resolve(root, entry[1]);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Resource path escaped repository root");
  return { contents: [{ uri, mimeType: entry[2], text: await readFile(target, "utf8") }] };
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === "initialize") {
    return response(id, {
      protocolVersion,
      capabilities: { resources: { listChanged: false }, prompts: { listChanged: false } },
      serverInfo: { name: "stock-league-event-local-ai-context", version: "1.0.0" },
      instructions: "Read the AI context resources before taking action. This server is read-only and exposes no mutation tools.",
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
  if (method === "ping") return response(id, {});
  if (method === "resources/list") {
    return response(id, { resources: resources.map(([uri, path, mimeType, description]) => ({ uri, name: uri.split("/").pop(), title: description, description: `Read-only repository resource: ${path}`, mimeType })) });
  }
  if (method === "resources/read") return response(id, await readResource(params.uri));
  if (method === "prompts/list") return response(id, { prompts });
  if (method === "prompts/get") {
    const prompt = prompts.find((item) => item.name === params.name);
    if (!prompt) throw new Error(`Unknown prompt: ${params.name}`);
    const args = params.arguments || {};
    return response(id, { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: promptText[prompt.name](args) } }] });
  }
  if (method === "tools/list") return response(id, { tools: [] });
  throw new Error(`Method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
    const result = await handle(message);
    if (result) process.stdout.write(`${result}\n`);
  } catch (error) {
    const id = message?.id ?? null;
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
});
