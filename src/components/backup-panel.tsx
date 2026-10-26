"use client";
import { useRef, useState } from "react";
import { Download, Upload, HardDrive, FileJson } from "lucide-react";
import { useData } from "@/components/data-provider";
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup } from "@/infrastructure/persistence/local";
import { downloadText } from "@/lib/format";
import type { Backup } from "@/domain/models";
export function BackupPanel() {
  const { data, importBackup } = useData(); const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <section className="panel backup-panel"><div className="panel-icon"><HardDrive size={24} /></div><h2>Seus dados, sob seu controle</h2><p>Os projetos ficam apenas neste navegador. Não há sincronização automática entre computador e celular.</p><div className="backup-count"><FileJson size={19} /><span>{data.projects.length} projetos no backup</span></div><button className="button secondary full" onClick={() => { try { downloadText(serializeBackup(data), `jpn-backup-${new Date().toISOString().slice(0, 10)}.json`); setMessage("Backup gerado. Guarde o arquivo em um local seguro."); setError(""); } catch { setError("Não foi possível gerar o backup."); } }}><Download size={18} />Exportar backup JSON</button><button className="button secondary full" disabled={busy} onClick={() => input.current?.click()}><Upload size={18} />{busy ? "Lendo arquivo…" : "Importar backup JSON"}</button><input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Selecionar backup JSON" onChange={async e => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setBusy(true); setError(""); setMessage(""); setBackup(null);
    try { if (file.size > MAX_BACKUP_BYTES) throw new Error("O backup excede o limite de 5 MB."); setBackup(parseBackup(await file.text())); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo."); }
    finally { setBusy(false); }
  }} /><p className="field-hint">JSON versionado · Até 5 MB<br />Importações adicionam cópias com novos IDs. Projetos existentes e configurações locais são preservados.</p>
    {backup && <div className="import-preview"><strong>Backup válido para importação</strong><p>{backup.data.projects.length} projetos e {backup.data.materials.length} materiais serão adicionados como cópias.</p><div className="actions"><button className="button" onClick={() => { const result = importBackup(backup); if (result) { setMessage(`Importação concluída: ${result.projects} projetos e ${result.materials} materiais adicionados.`); setBackup(null); } }}>Adicionar cópias</button><button className="button secondary" onClick={() => setBackup(null)}>Cancelar</button></div></div>}{error && <p className="field-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<div className="backup-tip"><strong>Crie uma rotina de backup</strong><p>Limpar os dados do navegador ou usar modo privado pode apagar seus cadastros. Exporte antes de trocar de dispositivo.</p></div>
  </section>;
}
