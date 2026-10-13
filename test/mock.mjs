// Mock Amp: token endpoint + GET endpoints answering with OpenAPI doc example payloads.
import http from "node:http"; import fs from "node:fs";
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const resolve = (s) => s?.$ref ? resolve(s.$ref.split("/").slice(1).reduce((o, k) => o[k], spec)) : s;
function ex(s, d = 0) { s = resolve(s); if (!s || d > 4) return null;
  if (s.example !== undefined) return s.example; if (s.enum) return s.enum[0]; if (s.const !== undefined) return s.const;
  if (s.oneOf || s.anyOf) return ex((s.oneOf || s.anyOf)[0], d + 1);
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => ex(x, d + 1)));
  const t = Array.isArray(s.type) ? s.type[0] : s.type;
  if (t === "object" || s.properties) return Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, ex(v, d + 1)]));
  if (t === "array") return [ex(s.items, d + 1)];
  if (t === "integer" || t === "number") return 1; if (t === "boolean") return true;
  if (s.format === "date-time") return "2026-01-01T00:00:00.000Z"; if (s.format === "uuid") return "00000000-0000-4000-8000-000000000000";
  if (s.format === "email") return "author@example.com"; return "string"; }
const routes = [];
for (const [p, v] of Object.entries(spec.paths)) { const g = v.get; if (!g) continue;
  const c = g.responses?.["200"]?.content?.["application/json"]; let ex2 = ex(c?.schema); if (p.includes("/contents")) ex2 = { kind: "file", commit: "string", path: "README.md", encoding: "base64", content: "SGVsbG8sIHdvcmxkIQo=", size: 1 };
  routes.push({ re: new RegExp("^" + p.replace("@{namespace}", "@[^/]+").replace(/\{path\}/, ".+").replace(/\{[^}]+\}/g, "[^/]+") + "$"), p, ex: ex2 }); }
let tokens = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "POST" && u.pathname === "/oauth2/token") {
    tokens++; let b = ""; req.on("data", (d) => (b += d)); return req.on("end", () => {
      const ok = (req.headers.authorization || "") === "Basic " + Buffer.from("test-id:test-secret").toString("base64") && new URLSearchParams(b).get("grant_type") === "client_credentials";
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(ok ? { access_token: "mock-access", token_type: "bearer", expires_in: 3600 } : { error: "invalid_client" }));
    }); }
  if (u.pathname === "/stats") return res.end(JSON.stringify({ tokens }));
  if (req.headers.authorization !== "Bearer mock-access") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":"Unauthorized"}'); }
  const r = routes.filter((r) => r.re.test(u.pathname)).sort((a, b) => b.p.length - a.p.length)[0];
  res.writeHead(r ? 200 : 404, { "content-type": "application/json" }); res.end(JSON.stringify(r ? (r.ex ?? {}) : { error: "not found" }));
}).listen(8787, () => console.log("mock on 8787,", routes.length, "GET routes"));
