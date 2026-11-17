"use client";
import type { AnchorPulloutReport } from "@/domain/support-interface";

const kn=(v:number)=>v.toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const ratio=(v:number|null)=>v===null?"—":v.toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const statusText={"within-declared-capacity":"Dentro da capacidade declarada","exceeds-declared-capacity":"EXCEDE a capacidade declarada",
  "capacity-pending":"PENDENTE: capacidade não declarada","no-demand":"Sem demanda"} as const;

/** N4: pull-out per support on an existing wall/concrete. Declared capacities only; never a pass without them. */
export function AnchorPulloutPanel({report}:{report:AnchorPulloutReport}){
  if(!report.supports.length)return null;
  return <section className="notice" data-testid="anchor-pullout" aria-label="Arrancamento por apoio">
    <h4>Arrancamento por apoio em parede existente (ELU)</h4>
    <p>Demanda = maior tração do apoio entre as combinações ELU do resultado. Capacidade = valor de cálculo declarado (ficha do fabricante), por apoio ou por tipo de ancoragem. O JPN não calcula ancoragem nem alvenaria; sem capacidade declarada o apoio fica PENDENTE.</p>
    {report.governingSupport&&<p data-testid="anchor-governing"><strong>Apoio que governa: {report.governingSupport.nodeId} · {report.governingSupport.combinationId??"—"} · razão {ratio(report.governingSupport.ratio)}</strong></p>}
    <div style={{overflowX:"auto"}} role="region" aria-label="Tabela de arrancamento por apoio" tabIndex={0}><table><thead><tr>
      <th>Apoio</th><th>Combinação que governa</th><th>Arrancamento (kN)</th><th>Capacidade (kN) e fonte</th><th>Demanda / capacidade</th><th>Situação</th><th>Compressão (kN) / capacidade</th>
    </tr></thead><tbody>
      {report.supports.map(s=><tr key={s.nodeId} data-testid={`anchor-row-${s.nodeId}`} data-critical={s.critical?"true":"false"} className={s.critical?"critical":undefined}
        style={s.critical?{fontWeight:700,outline:"2px solid #c0392b"}:undefined}>
        <td>{s.nodeId} · lado {s.side}{s.critical?" · CRÍTICO":""}</td>
        <td>{s.pullout.governingCombinationId??"—"}</td>
        <td>{kn(s.pullout.demandKn)}</td>
        <td>{s.pullout.declaredCapacity?`${kn(s.pullout.declaredCapacity.valueKn)} (${s.pullout.declaredCapacity.origin==="anchor-type"?"tipo "+s.pullout.declaredCapacity.anchorTypeId:"apoio"}; ${s.pullout.declaredCapacity.source})`:"não declarada"}</td>
        <td>{ratio(s.pullout.ratio)}</td>
        <td>{statusText[s.pullout.status]}{s.issues.length?" · "+s.issues.join(" "):""}</td>
        <td>{kn(s.compression.demandKn)} / {s.compression.declaredCapacity?kn(s.compression.declaredCapacity.valueKn):"não declarada"}</td>
      </tr>)}
    </tbody></table></div>
    <details><summary>Limitações</summary><ul>{[...report.limitations,report.supports[0].compression.note].map(x=><li key={x}>{x}</li>)}</ul></details>
  </section>;
}
