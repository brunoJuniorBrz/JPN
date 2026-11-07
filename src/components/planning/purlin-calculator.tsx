"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,FileDown,Plus,RotateCcw,Calculator,TriangleAlert} from "lucide-react";
import {NumberField} from "@/components/number-field";
import {Field,PageHeading,Select} from "@/components/ui";
import {downloadText} from "@/lib/format";
import {purlinInitialCandidates,purlinRequestSchema,purlinResultSchema,verifyPurlinResult,type PurlinCandidate,type PurlinRequest,type PurlinResult} from "@/domain/purlin";
import styles from "./purlin-calculator.module.css";

type CandidateDraft={id:string;family:"U"|"Ue"|"tube";height:string;width:string;thickness:string;lip:string;price:string;source:string};
const starter=()=>purlinInitialCandidates.map(c=>({
  id:c.id,family:c.family,height:String(c.height_mm),width:String(c.width_mm),thickness:String(c.thickness_mm),lip:String(c.lip_mm),
  price:"",source:c.source,
}));
const num=(value:string)=>value.trim()?Number(value.replace(",",".")):Number.NaN;
const fmt=(n:number,digits=2)=>n.toLocaleString("pt-BR",{maximumFractionDigits:digits,minimumFractionDigits:0});
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);

function ProfileSketch({family}:{family:CandidateDraft["family"]}){
  return <svg viewBox="0 0 74 64" role="img" aria-label={family==="U"?"Seção de perfil U":family==="Ue"?"Seção U enrijecido":"Seção de tubo retangular"}>
    {family==="tube"?<rect x="21" y="10" width="36" height="46" rx="2" fill="none" stroke="currentColor" strokeWidth="5"/>:
      <path d={family==="U"?"M50 12H23V54H50":"M49 22V12H23V54H49V44"} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="square" strokeLinejoin="round"/>}
  </svg>;
}

export function PurlinCalculator(){
  const [spanCount,setSpanCount]=useState(1);
  const [spanLength,setSpanLength]=useState<number|null>(4);
  const [condition,setCondition]=useState<"simple"|"fixed"|"cantilever">("simple");
  const [linearLoad,setLinearLoad]=useState<number|null>(-1000);
  const [elasticity,setElasticity]=useState<number|null>(200);
  const [density,setDensity]=useState<number|null>(7850);
  const [deflectionRatio,setDeflectionRatio]=useState<number|null>(250);
  const [profiles,setProfiles]=useState<CandidateDraft[]>(starter);
  const [result,setResult]=useState<{key:string;request:PurlinRequest;data:PurlinResult}|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{
    const task=window.setTimeout(()=>{
    try{
      const saved=localStorage.getItem("jpn-tercas-draft:v1");
      if(saved){
        const obj=JSON.parse(saved);
        if(obj&&typeof obj==="object"&&Array.isArray(obj.profiles)&&obj.profiles.length>0&&obj.profiles.length<=8){
          const valid=obj.profiles.every((x:unknown)=>typeof x==="object"&&x!==null&&["U","Ue","tube"].includes((x as CandidateDraft).family)
            &&["id","height","width","thickness","lip","price","source"].every(k=>typeof (x as unknown as Record<string,unknown>)[k]==="string"));
          if(valid){
            setProfiles(obj.profiles);
            if(Number.isInteger(obj.spanCount)&&obj.spanCount>=1&&obj.spanCount<=5)setSpanCount(obj.spanCount);
            if(typeof obj.spanLength==="number")setSpanLength(obj.spanLength);
            if(["simple","fixed","cantilever"].includes(obj.condition))setCondition(obj.condition);
            if(typeof obj.linearLoad==="number")setLinearLoad(obj.linearLoad);
            if(typeof obj.elasticity==="number")setElasticity(obj.elasticity);
            if(typeof obj.density==="number")setDensity(obj.density);
            if(typeof obj.deflectionRatio==="number")setDeflectionRatio(obj.deflectionRatio);
          }
        }
      }
    }catch{ /* Local draft may be absent or old. */ }
    setLoaded(true);
    },0);
    return ()=>window.clearTimeout(task);
  },[]);
  useEffect(()=>{
    if(!loaded)return;
    try{localStorage.setItem("jpn-tercas-draft:v1",JSON.stringify({spanCount,spanLength,condition,linearLoad,elasticity,density,deflectionRatio,profiles}));}catch{}
  },[loaded,spanCount,spanLength,condition,linearLoad,elasticity,density,deflectionRatio,profiles]);

  function alter(i:number,patch:Partial<CandidateDraft>){
    setProfiles(list=>list.map((entry,index)=>index===i?{...entry,...patch}:entry));
  }
  function candidate(c:CandidateDraft):PurlinCandidate{
    return {id:c.id,family:c.family,height_mm:num(c.height),width_mm:num(c.width),thickness_mm:num(c.thickness),
      lip_mm:c.family==="Ue"?num(c.lip):0,price_brl_per_m:c.price.trim()?num(c.price):null,source:c.source};
  }
  const draft=useMemo(()=>({
    span_count:spanCount,span_length_m:spanLength,end_condition:condition,uniform_load_n_m:linearLoad,
    e_gpa:elasticity,density_kg_m3:density,deflection_limit_ratio:deflectionRatio,candidates:profiles.map(candidate),
  }),[spanCount,spanLength,condition,linearLoad,elasticity,density,deflectionRatio,profiles]);
  const currentKey=JSON.stringify(draft);
  const currentResult=result?.key===currentKey?result:null;
  const changed=Boolean(result&&!currentResult);

  async function calculate(){
    if(busy)return;
    setError("");setBusy(true);setResult(null);
    try{
      const request=purlinRequestSchema.parse({schema_version:"jpn.purlin/1",request_id:crypto.randomUUID(),...draft});
      const response=await fetch("/api/experimental/purlin",{
        method:"POST",headers:{"Content-Type":"application/json","X-JPN-Purlin":"1"},
        body:JSON.stringify(request),cache:"no-store",
      });
      const json=await response.json();
      if(!response.ok)throw new Error(json?.error?.message??"Servidor não conseguiu executar o cálculo.");
      const data=purlinResultSchema.parse(json);
      verifyPurlinResult(request,data);
      setResult({key:currentKey,request,data});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível executar a análise.");}
    finally{setBusy(false);}
  }
  function exportResult(){
    if(!currentResult)return;
    downloadText(JSON.stringify({
      type:"jpn-purlin-screening/1",
      exportedAt:new Date().toISOString(),
      request:currentResult.request,result:currentResult.data,
      disclaimer:"Análise elástica idealizada; não é dimensionamento ou liberação de compra, corte ou fabricação.",
    },null,2),"jpn-tercas-avaliacao-preliminar.json");
  }
  function reset(){
    setSpanCount(1);setSpanLength(4);setCondition("simple");setLinearLoad(-1000);
    setElasticity(200);setDensity(7850);setDeflectionRatio(250);setProfiles(starter());setResult(null);setError("");
  }
  return <main className={styles.container}>
    <Link href="/projetos" className="back-link"><ArrowLeft size={18}/> Voltar aos projetos</Link>
    <PageHeading eyebrow="MOTOR EXPERIMENTAL · TERÇAS" title="Comparar terças metálicas" description="Informe a geometria, os apoios e uma carga linear já conhecida. O JPN executa uma análise elástica em Python e compara as respostas das seções."/>
    <div className={styles.warning} role="note"><TriangleAlert size={21}/><p><strong>Não é dimensionamento estrutural.</strong> Este cálculo considera apenas flexão linear no eixo forte, vãos iguais, apoios idealizados e carga vertical uniforme declarada. Não gera vento, não verifica torção/flambagem, ligações ou resistência conforme NBR. Não usar os resultados para comprar, cortar ou fabricar.</p></div>
    <div className={styles.layout}>
      <div className={styles.form}>
        <section className="panel" aria-labelledby="purlin-line-heading">
          <div className={styles.heading}><span>01</span><div><h2 id="purlin-line-heading">Configuração dos vãos</h2><p>Medidas reais da linha de terças, em metros.</p></div></div>
          <div className={styles.grid3}>
            <Field label="Quantidade de vãos"><Select value={String(spanCount)} onChange={e=>{const n=Number(e.target.value);setSpanCount(n);if(n>1&&condition==="cantilever")setCondition("simple");}}>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} {n===1?"vão":"vãos"}</option>)}</Select></Field>
            <NumberField label="Vão individual (m)" value={spanLength} min={.5} max={12} decimals={2} onChange={setSpanLength} hint="Mesmo comprimento para todos os vãos."/>
            <Field label="Condição de apoio"><Select value={condition} onChange={e=>{const v=e.target.value as typeof condition;setCondition(v);if(v==="cantilever")setSpanCount(1);}}>
              <option value="simple">Apoios simples / contínua</option>
              <option value="fixed">Extremidades engastadas</option>
              <option value="cantilever">Balanço engastado</option>
            </Select></Field>
          </div>
          <div className={styles.beamSketch} role="img" aria-label={condition==="cantilever"?"Esquema de terça em balanço":`Esquema de terça com ${spanCount} vãos e apoios`}>
            <svg viewBox="0 0 600 110">
              <path d="M30 42H566" stroke="#2e8c78" strokeWidth="5" strokeLinecap="round"/>
              {(condition==="cantilever"?[0]:Array.from({length:spanCount+1},(_,i)=>i)).map(i=>{
                const x=30+(536*i/spanCount);
                return <g key={i} transform={`translate(${x},42)`}>
                  {condition==="cantilever"||(condition==="fixed"&&(i===0||i===spanCount))?<><path d="M0 -25V28" stroke="#566d66" strokeWidth="8"/><path d="M-12 -25V28" stroke="#b5c8be" strokeWidth="2" strokeDasharray="4 3"/></>:
                    <><path d="M0 2L-11 24H11Z" fill="#b7cec0" stroke="#5d786d" strokeWidth="2"/><path d="M-15 28H15" stroke="#708c7d" strokeWidth="3"/></>}
                </g>;
              })}
              <g fill="#b66f43" stroke="#b66f43" strokeWidth="1.5">
                {Array.from({length:11},(_,i)=>{const x=38+i*51;return <g key={i}><path d={linearLoad!==null&&linearLoad>0?`M${x} 68V52`:`M${x} 16V32`}/><path d={linearLoad!==null&&linearLoad>0?`M${x-4} 57L${x} 51L${x+4} 57`:`M${x-4} 26L${x} 33L${x+4} 26`}/></g>})}
              </g>
              <text x="300" y="100" textAnchor="middle" fill="currentColor" fontSize="13">{spanCount} vão(s) de {spanLength??"?"} m · q={linearLoad??"?"} N/m</text>
            </svg>
          </div>
          <div className={styles.grid3}>
            <NumberField label="Carga linear declarada (N/m)" value={linearLoad} min={-200000} max={200000} decimals={2} onChange={setLinearLoad} hint="Negativa para baixo, positiva para sucção. Não é gerada automaticamente."/>
            <NumberField label="Módulo E do material (GPa)" value={elasticity} min={50} max={250} decimals={2} onChange={setElasticity} hint="200 GPa é um valor inicial editável; confirmar aço."/>
            <NumberField label="Densidade (kg/m³)" value={density} min={100} max={20000} decimals={0} onChange={setDensity}/>
          </div>
          <div className={styles.grid3}>
            <NumberField label="Limite de flecha L /" value={deflectionRatio} min={100} max={1000} decimals={0} onChange={setDeflectionRatio} hint="Critério fornecido pelo usuário; não é aprovação normativa."/>
          </div>
        </section>
        <section className="panel" aria-labelledby="purlin-sections-heading">
          <div className={styles.heading}><span>02</span><div><h2 id="purlin-sections-heading">Perfis para comparar</h2><p>Dimensões externas nominais, em mm. Sem raios de dobra, torção ou resistência verificada.</p></div></div>
          <div className={styles.profiles}>
            {profiles.map((p,i)=><fieldset key={p.id} className={styles.profile} data-testid="purlin-candidate">
              <legend>{i+1}. Candidato {p.id}</legend>
              <div className={styles.profileHead}>
                <ProfileSketch family={p.family}/>
                <Field label={`Família do perfil ${i+1}`}><Select value={p.family} onChange={e=>{const family=e.target.value as CandidateDraft["family"];alter(i,{family,lip:family==="Ue"?"15":"0"});}}>
                  <option value="U">U simples</option><option value="Ue">U enrijecido</option><option value="tube">Tubo retangular</option>
                </Select></Field>
                {profiles.length>1&&<button type="button" className="button secondary" onClick={()=>setProfiles(old=>old.filter((_,j)=>j!==i))}>Remover</button>}
              </div>
              <div className={styles.profileFields}>
                {([
                  ["height","Altura (mm)"],["width","Largura (mm)"],["thickness","Espessura (mm)"],
                  ...(p.family==="Ue"?[["lip","Enrijecedor (mm)"]]:[]),["price","Preço por metro (R$)"],
                ] as [keyof CandidateDraft,string][]).map(([key,label])=><label key={key}>{label}<input aria-label={`${label} · candidato ${i+1}`} type="text" inputMode="decimal" value={p[key]} placeholder={key==="price"?"Opcional":""} onChange={e=>alter(i,{[key]:e.target.value})}/></label>)}
              </div>
              <label className={styles.sourceField}>Fonte das dimensões<input aria-label={`Fonte das dimensões · candidato ${i+1}`} value={p.source} maxLength={200} onChange={e=>alter(i,{source:e.target.value})}/></label>
            </fieldset>)}
          </div>
          {profiles.length<8&&<button type="button" className="button secondary" onClick={()=>setProfiles(a=>[...a,{id:"C"+crypto.randomUUID().slice(0,8),family:"Ue",height:"75",width:"40",thickness:"2,65",lip:"15",price:"",source:"Geometria informada pelo usuário"}])}><Plus size={17}/>Adicionar perfil</button>}
        </section>
        <div className={styles.actions}>
          <button type="button" className="button" disabled={busy} onClick={()=>void calculate()}><Calculator size={18}/>{busy?"Calculando com Python…":"Calcular e comparar no Python"}<ArrowRight size={18}/></button>
          <button type="button" className="button secondary" disabled={busy} onClick={reset}><RotateCcw size={17}/>Reiniciar</button>
        </div>
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        {changed&&<p className="notice">Entradas alteradas. Execute novamente para atualizar os resultados.</p>}
      </div>
      <aside className={styles.results}>
        <section className="panel" aria-label="Resultados elásticos da terça">
          <h2>Resultados do motor</h2>
          {!currentResult?<p className={styles.placeholder}>A análise ainda não foi executada para estas medidas. Use o botão “Calcular e comparar no Python”.</p>:<>
            <p className={styles.resultNote}>Resultado elástico de {currentResult.data.results.length} perfis · sem aprovação estrutural</p>
            <div className={styles.resultCards}>
              {currentResult.data.results.map(r=><article key={r.id} data-testid="purlin-result">
                <div className={styles.resultTitle}><strong>{r.id} · {r.family}</strong><small>{r.section_model==="sharp-corner-linear-elastic-approximation"?"Seção geométrica aproximada":""}</small></div>
                <div className={styles.numbers}>
                  <div><span>Flecha máxima (módulo)</span><b>{fmt(Math.abs(r.deflection_mm),3)} mm</b></div>
                  <div><span>Limite informado</span><b>{fmt(r.deflection_limit_mm,3)} mm</b></div>
                  <div><span>Momento máximo (módulo)</span><b>{fmt(Math.abs(r.peak_moment_nm)/1000,3)} kN·m</b></div>
                  <div><span>Cortante máximo (módulo)</span><b>{fmt(Math.abs(r.peak_shear_n)/1000,3)} kN</b></div>
                  <div><span>Massa nominal aproximada</span><b>{fmt(r.mass_kg,2)} kg</b></div>
                  <div><span>{r.estimated_material_cost_brl===null?"Preço não informado":"Material (sem perdas)"}</span><b>{r.estimated_material_cost_brl===null?"—":money(r.estimated_material_cost_brl)}</b></div>
                </div>
                <p className={styles.limitStatus}>{r.within_user_deflection_limit?"Dentro do limite de flecha informado.":"Acima do limite de flecha informado."} <strong>Não significa perfil aprovado.</strong></p>
                <details><summary>Reações e propriedades</summary>
                  <p>Área: {fmt(r.area_mm2,2)} mm² · Inércia geométrica: {fmt(r.inertia_mm4,1)} mm⁴.</p>
                  <p>Flecha extrema em {fmt(r.deflection_at_m,3)} m; momento extremo em {fmt(r.moment_at_m,3)} m.</p>
                  <table><thead><tr><th>Suporte</th><th>Reação vertical</th><th>Momento de apoio</th></tr></thead><tbody>
                  {r.reactions.map((reaction,j)=><tr key={j}><td>{fmt(reaction.at_m,2)} m</td><td>{fmt(reaction.vertical_n,2)} N</td><td>{fmt(reaction.moment_nm,2)} N·m</td></tr>)}
                  </tbody></table>
                </details>
              </article>)}
            </div>
            <button type="button" className="button secondary" onClick={exportResult}><FileDown size={18}/>Exportar dados e resultados JSON</button>
          </>}
        </section>
        <div className={styles.smallNote}>
          <strong>O que falta para dimensionar?</strong>
          <p>Ações de vento e telha conforme o caso, propriedades verificadas da seção, torção, flambagem, resistência, contraventamento, ligações e revisão do responsável técnico. Não há seleção automática de perfil seguro nesta versão.</p>
          <p>Esta é uma calculadora independente; conectar os resultados a uma obra cadastrada é uma etapa posterior.</p>
        </div>
      </aside>
    </div>
  </main>;
}
