// Minimal MCP stdio client: node test/client.mjs '<json calls array>'
import { spawn } from "node:child_process";
const calls = JSON.parse(process.argv[2] || "[]");
const p = spawn("node", [new URL("../server/index.mjs", import.meta.url).pathname], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = "", pending = new Map(), id = 0;
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const m = JSON.parse(l); pending.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise((r) => { const n = ++id; pending.set(n, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
console.log("initialize ->", JSON.stringify(init.result.serverInfo), init.result.protocolVersion);
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const tl = await rpc("tools/list", {});
console.log("tools/list ->", tl.result.tools.length, "tools:", tl.result.tools.map((t) => t.name).join(", "));
for (const [name, args, show] of calls) {
  const r = await rpc("tools/call", { name, arguments: args });
  const t = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
  console.log(`\n# ${name} isError=${!!r.result?.isError}\n${show === "full" ? t : t.slice(0, 220)}`);
}
console.log("\nserver still alive:", p.exitCode === null); p.kill();
