// Local-only development entry point. Never used by build/start or Vercel.
import { createServer } from "node:http";

if (process.env.NODE_ENV === "production") throw new Error("O executor estrutural local não inicia em produção.");
const port = Number(process.env.JPN_LOCAL_PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Porta local inválida.");
const origin = `http://127.0.0.1:${port}`;
process.env.NODE_ENV = "development";
process.env.JPN_LOCAL_MIXED_ENABLED = "1";
process.env.JPN_LOCAL_MIXED_ORIGIN = origin;
// Load Next only after setting its initial environment snapshot.
const { default: next } = await import("next");
let handler;
const server = createServer((req, res) => {
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
  const host = req.headers.host === `127.0.0.1:${port}`;
  if (!loopback || !host) { res.writeHead(403); res.end("Acesso restrito a 127.0.0.1."); return; }
  if (req.url?.startsWith("/api/experimental/mixed3d") || req.url?.startsWith("/api/experimental/second-order-frame")) {
    const source = req.headers.origin, site = req.headers["sec-fetch-site"];
    if ((req.method === "POST" && source !== origin) || (source && source !== origin) || (site && !["same-origin", "none"].includes(site))) { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "ORIGIN", message: "Origem não permitida." } })); return; }
  }
  handler(req, res);
});
const app = next({ dev: true, hostname: "127.0.0.1", port, httpServer: server });
await app.prepare(); handler = app.getRequestHandler();
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.listen(port, "127.0.0.1", () => process.stdout.write(`JPN estrutural local: ${origin}\n`));
const stop = () => { server.close(); void app.close().finally(() => process.exit(0)); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
