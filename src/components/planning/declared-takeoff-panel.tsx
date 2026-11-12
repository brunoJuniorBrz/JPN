"use client";
import type { Project } from "@/domain/models";
import { declaredTakeoff } from "@/domain/declared-takeoff";
import { downloadText } from "@/lib/format";
export function DeclaredTakeoffPanel({project}:{project:Project}){
  const report=declaredTakeoff(project),show=(v:number|null)=>v===null?"Pendente":v.toLocaleString("pt-BR",{maximumFractionDigits:6});
  return <section data-testid="declared-takeoff"><h3>Levantamento preliminar das barras declaradas</h3>
    <p>{report.totals.quantity} peças · {show(report.totals.lengthM)} m geométricos · massa {show(report.totals.massKg)} kg. Revisão {report.modelRevision}.</p>
    <p>Distância entre nós, sem descontos de ligação. Comprimentos de fabricação, estoque, aproveitamento, soldas, chapas e parafusos não são inferidos. Massa somente com A e densidade rastreáveis; preço somente em R$/m explicitamente cadastrado na seção.</p>
    <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Grupo / perfil / material</th><th>IDs</th><th>Quantidade</th><th>Comprimento (m)</th><th>Massa (kg)</th></tr></thead><tbody>{report.groups.map(g=><tr key={g.key}><td>{g.label} · {g.materialId}</td><td>{g.pieceIds.join(", ")}</td><td>{g.quantity}</td><td>{show(g.lengthM)}</td><td>{show(g.massKg)}</td></tr>)}</tbody></table></div>
    <button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify(report,null,2),"jpn-quantitativo-declarado-preliminar.json")}>Exportar quantitativo declarado JSON</button>
  </section>;
}
