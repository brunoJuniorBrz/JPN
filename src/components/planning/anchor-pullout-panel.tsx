"use client";
import type { AnchorPulloutReport } from "@/domain/support-interface";

const kn=(v:number|null)=>v===null?"—":v.toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const ratio=(v:number|null)=>v===null?"—":v.toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const statusText={"within-declared-capacity":"Tração isolada dentro da capacidade declarada (não é aprovação)","exceeds-declared-capacity":"EXCEDE a capacidade declarada",
  "capacity-pending":"PENDENTE: capacidade não declarada","no-demand":"Sem demanda","verification-pending":"PENDENTE: ELU não verificado"} as const;

/** N4: pull-out per support on an existing wall/concrete. Declared capacities only; never a pass without them. */
export function AnchorPulloutPanel({report}:{report:AnchorPulloutReport}){
  if(!report.supports.length)return null;
  return <section className="notice" data-testid="anchor-pullout" aria-label="Arrancamento por apoio">
    <h4>Arrancamento por apoio em parede existente (ELU)</h4>
    <p>Demanda = maior tração do apoio entre as combinações ELU rastreadas do resultado. Capacidade = valor de cálculo declarado, por apoio ou tipo de ancoragem. Sem ELU comprovado não se emite demanda nem razão de utilização.</p>
    <p><strong>Verificação parcial:</strong> a comparação isolada de tração NÃO aprova o apoio. Interação tração + cisalhamento, momento, capacidade por chumbador versus conjunto, Cpi crítico e resistência da parede exigem revisão técnica.</p>
    {report.governingSupport&&<p data-testid="anchor-governing"><strong>Apoio que governa: {report.governingSupport.nodeId} · {report.governingSupport.combinationId??"—"} · razão {ratio(report.governingSupport.ratio)}</strong></p>}
    <div style={{overflowX:"auto"}} role="region" aria-label="Tabela de arrancamento por apoio" tabIndex={0}><table><thead><tr>
      <th>Apoio</th><th>Combinação que governa</th><th>Arrancamento (kN)</th><th>Cisalhamento concomitante (kN) / momento (kN·m)</th><th>Capacidade (kN) e fonte</th><th>Demanda / capacidade</th><th>Situação</th><th>Compressão (kN) / capacidade</th>
    </tr></thead><tbody>
      {report.supports.map(s=><tr key={s.nodeId} data-testid={`anchor-row-${s.nodeId}`} data-critical={s.critical?"true":"false"} className={s.critical?"critical":undefined}
        style={s.critical?{fontWeight:700,outline:"2px solid #c0392b"}:undefined}>
        <td>{s.nodeId} · lado {s.side}{s.critical?" · CRÍTICO":""}</td>
        <td>{s.pullout.governingCombinationId??"—"}</td>
        <td>{kn(s.pullout.demandKn)}</td>
        <td>{s.pullout.concurrentHorizontalShearKn===null?"—":`${kn(s.pullout.concurrentHorizontalShearKn)} / ${kn(s.pullout.concurrentMomentKnM??0)}`}</td>
        <td>{s.pullout.declaredCapacity?`${kn(s.pullout.declaredCapacity.valueKn)} (${s.pullout.declaredCapacity.origin==="anchor-type"?"tipo "+s.pullout.declaredCapacity.anchorTypeId:"apoio"}; ${s.pullout.declaredCapacity.source})`:"não declarada"}</td>
        <td>{ratio(s.pullout.ratio)}</td>
        <td>{s.issues.length&&s.pullout.status!=="exceeds-declared-capacity"&&s.pullout.status!=="capacity-pending"?"PENDENTE · ":""}{statusText[s.pullout.status]}{s.issues.length?" · "+s.issues.join(" "):""}</td>
        <td>{kn(s.compression.demandKn)} / {s.compression.declaredCapacity?kn(s.compression.declaredCapacity.valueKn):"não declarada"}</td>
      </tr>)}
    </tbody></table></div>
    <details><summary>Limitações</summary><ul>{[...report.limitations,report.supports[0].compression.note].map(x=><li key={x}>{x}</li>)}</ul></details>
  </section>;
}
