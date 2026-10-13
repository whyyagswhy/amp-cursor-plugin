#!/usr/bin/env node
// Zero-dependency stdio MCP server for the Amp External API (read-only, v1).
import { createInterface } from "node:readline";

const DEFAULT_BASE = "https://ampcode.com/api/v2";
const DEFAULT_TOKEN_URL = "https://auth.ampcode.com/oauth2/token";
const clean = (v) => (v && !/^\$\{.*\}$/.test(v.trim()) ? v.trim() : "");
const BASE = (clean(process.env.AMP_API_BASE_URL) || DEFAULT_BASE).replace(/\/+$/, "");
const TOKEN_URL = clean(process.env.AMP_TOKEN_URL) || DEFAULT_TOKEN_URL; // testing/override only
const CLIENT_ID = clean(process.env.AMP_CLIENT_ID);
const CLIENT_SECRET = clean(process.env.AMP_CLIENT_SECRET);
const SCOPES = clean(process.env.AMP_SCOPES) || [
  "amp.api:workspace.threads.meta:view", "amp.api:workspace.threads.contents:view",
  "amp.api:workspace.members:view", "amp.api:workspace.projects:view", "amp.git:read",
  "amp.api:workspace.groups:view", "amp.api:workspace.entitlements:view",
].join(" ");

class ToolError extends Error {}

// ---- OAuth2 client_credentials with in-memory cache ----
let cached = null; // { token, exp }
let inflight = null;
async function getToken(force = false) {
  if (!CLIENT_ID || !CLIENT_SECRET)
    throw new ToolError("Missing AMP_CLIENT_ID / AMP_CLIENT_SECRET. Configure the plugin variables with your Amp M2M application credentials.");
  if (!force && cached && Date.now() < cached.exp - 60_000) return cached.token;
  if (inflight) return inflight;
  inflight = (async () => {
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: SCOPES });
    const basic = Buffer.from(`${encodeURIComponent(CLIENT_ID)}:${encodeURIComponent(CLIENT_SECRET)}`).toString("base64");
    let res;
    try {
      res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(20000) });
    } catch (e) { throw new ToolError(`Token request failed: ${e.message}`); }
    const text = await res.text();
    let j = {}; try { j = JSON.parse(text); } catch {}
    if (!res.ok || !j.access_token)
      throw new ToolError(`Amp token endpoint returned HTTP ${res.status}: ${j.error_description || j.error || text.slice(0, 200) || res.statusText}`);
    cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
    return cached.token;
  })();
  try { return await inflight; } finally { inflight = null; }
}

async function api(path, query = {}, retried = false) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const token = await getToken();
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  } catch (e) { throw new ToolError(`Request to ${url.pathname} failed: ${e.message}`); }
  if (res.status === 401 && !retried) { cached = null; return api(path, query, true); }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || (typeof data === "string" ? data.slice(0, 300) : "") || res.statusText;
    throw new ToolError(`Amp API ${res.status} on GET ${url.pathname}: ${msg}`);
  }
  return data;
}

const enc = encodeURIComponent;
function projectPath(project) {
  if (!project) throw new ToolError("project is required (UUID or @namespace/name)");
  const p = String(project).trim();
  if (p.startsWith("@")) {
    const [ns, ...rest] = p.slice(1).split("/");
    if (!ns || !rest.length) throw new ToolError("project must be @namespace/name");
    return `/workspace/projects/@${enc(ns)}/${enc(rest.join("/"))}`;
  }
  return `/workspace/projects/${enc(p)}`;
}
const req = (a, ...ks) => { for (const k of ks) if (a[k] === undefined || a[k] === "") throw new ToolError(`${k} is required`); };

const S = (desc, extra = {}) => ({ type: "string", description: desc, ...extra });
const I = (desc) => ({ type: "integer", minimum: 1, description: desc });
const repoProps = {
  project: S("Project UUID or @namespace/name"),
  ref: S("Branch, tag, or commit (e.g. main)"),
};
const searchProps = { ...repoProps, q: S(""), path: S("Repository-relative path prefix"), limit: I("Max results (default 25)"), cursor: S("nextCursor from a previous call") };

const tools = [
  { name: "list_threads", description: "List Amp threads in the workspace (AmpThread: id, title, createdAt, updatedAt, creatorUserID, repositories[{url,dir}], labels, subThreads). Filter by text, project, sync date, creator email.",
    inputSchema: { type: "object", properties: {
      query: S("Search text in thread content"), project: S("Project UUID or namespace/name"),
      after: S("ISO 8601; first sync after"), before: S("ISO 8601; first sync before"),
      order: S("ASC (oldest first, default) or DESC", { enum: ["ASC", "DESC"] }),
      creator_email: S("Only threads created by this workspace member email"),
      limit: I("Max results (default 50)"), cursor: S("nextCursor from a previous call") } },
    run: (a) => api("/threads", { query: a.query, project: a.project, after: a.after, before: a.before, sort: a.order, userEmail: a.creator_email, limit: a.limit, cursor: a.cursor }) },
  { name: "get_thread_messages", description: "Get messages of a thread (T-...). Only messageID/messageVersion/createdAt are stable fields.",
    inputSchema: { type: "object", required: ["thread_id"], properties: { thread_id: S("Thread ID, T-..."), limit: I("Max results (default 50)"), cursor: S("Pagination cursor") } },
    run: (a) => { req(a, "thread_id"); return api(`/threads/${enc(a.thread_id)}/messages`, { limit: a.limit, cursor: a.cursor }); } },
  { name: "get_thread_usage", description: "Get ThreadUsage {threadID, subThreadIDs, usage (USD), models[]} for a thread < 90 days old.",
    inputSchema: { type: "object", required: ["thread_id"], properties: { thread_id: S("Thread ID, T-...") } },
    run: (a) => { req(a, "thread_id"); return api(`/threads/${enc(a.thread_id)}/usage`); } },
  { name: "list_members", description: "List workspace members (id, name, email, role).", inputSchema: { type: "object", properties: {} }, run: () => api("/workspace/members") },
  { name: "list_projects", description: "List workspace-owned projects (id, name, namespace, repository).",
    inputSchema: { type: "object", properties: { name: S("Exact project name (case-insensitive)"), limit: I("Max results (default 50)"), cursor: S("Pagination cursor") } },
    run: (a) => api("/workspace/projects", { name: a.name, limit: a.limit, cursor: a.cursor }) },
  { name: "search_repo_commits", description: "Search commit messages/author names (case-insensitive substring) in a project's repository.",
    inputSchema: { type: "object", required: ["project", "ref", "q"], properties: { ...searchProps, q: S("Substring to find in commit messages/authors") } },
    run: (a) => { req(a, "ref", "q"); return api(projectPath(a.project) + "/repository/commits/search", { ref: a.ref, q: a.q, path: a.path, limit: a.limit, cursor: a.cursor }); } },
  { name: "search_repo_content", description: "Regex search over file contents in a project's repository.",
    inputSchema: { type: "object", required: ["project", "ref", "q"], properties: { ...searchProps, q: S("Regular expression"), case_sensitive: { type: "boolean" } } },
    run: (a) => { req(a, "ref", "q"); return api(projectPath(a.project) + "/repository/content/search", { ref: a.ref, q: a.q, path: a.path, limit: a.limit, cursor: a.cursor, caseSensitive: a.case_sensitive === undefined ? undefined : String(a.case_sensitive) }); } },
  { name: "search_repo_paths", description: "Glob search over file paths (* ? within a segment, ** across).",
    inputSchema: { type: "object", required: ["project", "ref", "q"], properties: { ...searchProps, q: S("Glob, e.g. **/*.ts") } },
    run: (a) => { req(a, "ref", "q"); return api(projectPath(a.project) + "/repository/paths/search", { ref: a.ref, q: a.q, path: a.path, limit: a.limit, cursor: a.cursor }); } },
  { name: "get_repo_contents", description: "Read a file (returned decoded as UTF-8 text) or list a directory in a project's repository. Omit path for repo root.",
    inputSchema: { type: "object", required: ["project", "ref"], properties: { ...repoProps, path: S("Repository-relative file or directory path"), recursive: { type: "boolean" }, limit: I("Directory page size (default 100)"), cursor: S("Pagination cursor") } },
    run: async (a) => {
      req(a, "ref");
      const p = a.path ? "/" + String(a.path).replace(/^\/+/, "").split("/").map(enc).join("/") : "";
      const d = await api(projectPath(a.project) + "/repository/contents" + p, { ref: a.ref, recursive: a.recursive === undefined ? undefined : String(a.recursive), limit: a.limit, cursor: a.cursor });
      if (d && d.kind === "file" && d.encoding === "base64" && typeof d.content === "string") {
        const buf = Buffer.from(d.content, "base64");
        const binary = buf.includes(0);
        return { kind: "file", commit: d.commit, path: d.path, size: d.size, encoding: binary ? "base64" : "utf-8", binary, content: binary ? d.content : buf.toString("utf8") };
      }
      return d;
    } },
  { name: "repo_diff", description: "Diff a ref against its parent, or against merge-base with base.",
    inputSchema: { type: "object", required: ["project", "ref"], properties: { ...repoProps, base: S("Optional base ref (merge-base comparison)") } },
    run: (a) => { req(a, "ref"); return api(projectPath(a.project) + "/repository/diff", { ref: a.ref, base: a.base }); } },
  { name: "list_groups", description: "List workspace groups and their members.", inputSchema: { type: "object", properties: {} }, run: () => api("/workspace/groups") },
  { name: "list_entitlements", description: "List workspace credit entitlements (limits, windows, assignments).", inputSchema: { type: "object", properties: {} }, run: () => api("/workspace/entitlements") },
];
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

// ---- JSON-RPC over stdio (newline-delimited) ----
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const isReq = id !== undefined && id !== null;
  switch (method) {
    case "initialize":
      return ok(id, { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "amp", version: "0.1.0" } });
    case "notifications/initialized": case "notifications/cancelled": return;
    case "ping": return ok(id, {});
    case "tools/list":
      return ok(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } })) });
    case "tools/call": {
      const t = byName[params.name];
      if (!t) return err(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const r = await t.run(params.arguments || {});
        return ok(id, { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], structuredContent: r && typeof r === "object" && !Array.isArray(r) ? r : undefined });
      } catch (e) {
        return ok(id, { isError: true, content: [{ type: "text", text: e instanceof ToolError ? e.message : `Unexpected error: ${e.message}` }] });
      }
    }
    default:
      if (isReq) err(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch { return err(null, -32700, "Parse error"); }
  Promise.resolve(handle(msg)).catch((e) => msg.id != null && err(msg.id, -32603, e.message));
});
process.on("uncaughtException", (e) => process.stderr.write(`amp-mcp: ${e.stack}\n`));
