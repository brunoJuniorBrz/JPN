"use client";
import { useState } from "react";
import { useData } from "@/components/data-provider";
import { HttpProjectStore } from "@/infrastructure/projects/http-project-store";
import { migrateLocalProjects } from "@/domain/server-projects";
import { serializeBackup } from "@/infrastructure/persistence/local";
import { downloadText } from "@/lib/format";

/** Single-operator server persistence. The local copy is a cache and is never modified here: projects are only SENT (versioned, bit-identical)
 * or DOWNLOADED as a backup file. Anything the server already holds with different content is reported, never overwritten. */
export function ServerProjectsPanel() {
  const { data } = useData(), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [rows, setRows] = useState<{ projectId: string; name: string; version: number; payloadSha256: string }[] | null>(null);
  const store = new HttpProjectStore();
  async function run(task: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Falha ao falar com o servidor."); } finally { setBusy(false); } }
  return <details className="technical-details" data-testid="server-projects"><summary>Projetos no servidor (operador único)</summary>
    <p>O servidor guarda cada gravação como uma <strong>versão</strong> numerada, sem alterar dados nem números. Este navegador continua sendo um cache local.</p>
    <div className="actions">
      <button className="button" disabled={busy} onClick={() => void run(async () => {
        const report = await migrateLocalProjects(store, "operator", data);
        setMessage(`${report.migrated.length} projeto(s) enviado(s); ${report.skipped.length} já estavam no servidor${report.skipped.some(s => s.reason.includes("diferente")) ? " (alguns com conteúdo diferente: nada foi sobrescrito)" : ""}.`);
        setRows(await store.summaries());
      })}>Enviar projetos deste navegador ao servidor</button>
      <button className="button secondary" disabled={busy} onClick={() => void run(async () => { setRows(await store.summaries()); })}>Ver projetos no servidor</button>
      <button className="button secondary" disabled={busy} onClick={() => void run(async () => {
        const records = await store.list();
        downloadText(serializeBackup({ ...data, projects: records.map(r => r.payload) }), "jpn-projetos-servidor.json");
        setMessage(`${records.length} projeto(s) do servidor baixado(s) como backup (versões mais recentes).`);
      })}>Baixar projetos do servidor (backup)</button>
    </div>
    {message && <p role="status" data-testid="server-projects-message">{message}</p>}
    {error && <p className="field-error" role="alert" data-testid="server-projects-error">{error}</p>}
    {rows && <ul data-testid="server-projects-list">{rows.map(r => <li key={r.projectId}>{r.name} · v{r.version} · {r.payloadSha256.slice(0, 12)}…</li>)}{!rows.length && <li>Nenhum projeto no servidor.</li>}</ul>}
  </details>;
}
