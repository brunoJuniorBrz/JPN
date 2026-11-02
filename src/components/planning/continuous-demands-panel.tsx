"use client";
import type { ContinuousDemands } from "@/domain/continuous-demands";
import { demandComponents } from "@/domain/member-demands";

export function ContinuousDemandsPanel({report,pieceId}:{report:ContinuousDemands|null;pieceId:string}){
  const p=report?.pieces.find(p=>p.pieceId===pieceId),rows=p?.fields.flatMap(f=>f.rows);
  return <details data-testid="continuous-demands"><summary>Extremos contínuos — M26 parcial</summary>
    <p>Campos de primeira ordem com cargas uniformes integrais e torção constante. Extremos de interação resistente, norma e aprovação de peça permanecem pendentes.</p>
    {!p||!rows?<p>Extremos contínuos indisponíveis nesta execução. Use “Calcular ações de ligações” para obter os eixos reais auditados, sem presumir a orientação.</p>:<>
      <p>Peça {p.pieceId}: contínuo verificado para esforços individuais. Deslocamento local: {p.coverage.localDisplacement}; corda do segmento: {p.coverage.segmentRelativeDeflection}. Flecha da peça inteira é apresentada no painel próprio.</p>
      <div style={{overflowX:"auto"}} role="region" tabIndex={0} aria-label="Extremos contínuos concomitantes"><table><thead><tr><th>Critério</th><th>Segmento / combinação</th><th>x segmento / peça (m)</th><th>N, Vy, Vz (N); T, My, Mz (N·m)</th></tr></thead><tbody>
        {demandComponents.flatMap(k=>{const ex=p.extrema[k];return ex?(["minimum","maximum","absolute"] as const).map(criterion=>{const row=rows.find(r=>r.id===ex[criterion])!;return <tr key={`${k}-${criterion}`}><td>{k} {criterion}</td><td>{row.segmentId} / {row.combinationId}</td><td>{row.segmentPositionM.toPrecision(7)} / {row.originalPositionM.toPrecision(7)}</td><td>{demandComponents.map(k=>`${k}: ${row.forces[k]?.toExponential(5)??"não aplicável"}`).join("; ")}</td></tr>;}):[];})}
      </tbody></table></div>
      <details><summary>Posições críticas de deslocamento e corda</summary><p>Extremos de cada componente local: candidatos obtidos pelas raízes da derivada, com esforços concomitantes. Norma do vetor deslocamento e limite de serviço não verificados.</p><ul>{p.fields.map(f=><li key={`${f.segmentId}-${f.combinationId}`}>{f.segmentId} / {f.combinationId}: {f.displacementStatus}; x dos candidatos (m): {f.rows.map(r=>r.segmentPositionM.toPrecision(6)).join("; ")}</li>)}</ul></details>
    </>}
  </details>;
}
