"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { emptyPlanning } from "@/domain/structure";
import { guidedArrangements,guidedPreset,guidedSupportSchema,guidedSupportIssue,applyGuidedSketch,type GuidedArrangement,type GuidedSupport } from "@/domain/guided-support";
import css from "./guided-roof-setup.module.css";

const arrangements=(Object.keys(guidedArrangements) as GuidedArrangement[]);
const edges: {value:GuidedSupport["left"];label:string}[]=[
 {value:"new-column",label:"Pilar metálico novo"},
 {value:"existing-masonry",label:"Parede / alvenaria existente"},
 {value:"unknown",label:"Ainda não sei"}
];
function RoofIcon({gable}:{gable:boolean}){
 return <svg viewBox="0 0 160 88" role="img" aria-label={gable?"Cobertura duas águas":"Cobertura uma água"}>
   <path d="M18 71V42 M142 71V42 M12 73H148" fill="none" stroke="#9aa8a3" strokeWidth="2" strokeLinecap="round"/>
   {gable?<><path d="M13 44L80 13L147 44" fill="none" stroke="#446e64" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><path d="M80 13V71" stroke="#b7c1bb" strokeWidth="1.6" strokeDasharray="4 4"/></>:<path d="M13 27L147 49" fill="none" stroke="#446e64" strokeWidth="5" strokeLinecap="round"/>}
 </svg>;
}
function SupportIcon({left,right,coverage,gable,large=false}:{left:GuidedSupport["left"];right:GuidedSupport["right"];coverage:GuidedSupport["coverage"];gable:boolean;large?:boolean}){
 const element=(x:number,kind:GuidedSupport["left"])=>kind==="new-column"
 ?<><path d={"M"+x+" 57V117"} stroke="#496c72" strokeWidth="5" strokeLinecap="round"/><rect x={x-9} y="116" width="18" height="6" rx="1.5" fill="#87978e"/></>
 :kind==="existing-masonry"?<><rect x={x-10} y="51" width="20" height="70" rx="1" fill="#d5c7b0" stroke="#9e8a70" strokeWidth="1"/>{[67,83,99,115].map(y=><path key={y} d={"M"+(x-10)+" "+y+"H"+(x+10)} stroke="#aa987c" strokeWidth="1"/>)}</>
 :<><path d={"M"+x+" 58V113"} stroke="#a2a7a4" strokeWidth="3" strokeDasharray="5 4"/><text x={x} y="100" textAnchor="middle" fontSize="20" fill="#a26c38">?</text></>;
 return <svg viewBox="0 0 250 145" className={large?css.largeArt:css.art} role="img" aria-label={"Apoio esquerdo: "+left+"; direito: "+right}>
   <path d="M7 123H243" stroke="#c6cec5" strokeWidth="2"/>{element(31,left)}{element(219,right)}
   <path d={gable?"M21 58L125 20L229 58":"M21 42L229 58"} fill="none" stroke="#395e64" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"/>
   <path d={gable?"M31 58H219":"M31 43H219"} fill="none" stroke="#95aea3" strokeWidth="2" strokeDasharray="6 5"/>
   {coverage==="partial"&&<><path d="M125 18V124" stroke="#d19748" strokeWidth="1.8" strokeDasharray="5 4"/><text x="125" y="138" textAnchor="middle" fontSize="10" fill="#936938">Cobertura parcial</text></>}
   <text x="31" y="135" textAnchor="middle" fontSize="9" fill="#737e78">A</text><text x="219" y="135" textAnchor="middle" fontSize="9" fill="#737e78">B</text>
 </svg>;
}

export function GuidedRoofSetup({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
 const current=project.workspace.guidedSupport;
 const p=project.planning??emptyPlanning();
 const [notice,setNotice]=useState("");
 const [glossaryOpen,setGlossaryOpen]=useState(false);
 const support=current??guidedPreset("steel");
 function choose(option:GuidedArrangement){
  const next=guidedPreset(option);onChange({workspace:{...project.workspace,guidedSupport:next}});
  setNotice(option==="steel"?"Esboço metálico selecionado. Apoios e perfis ainda precisam ser definidos.":"Apoio existente registrado. O JPN não criará pilares metálicos como substitutos para essa construção.");
 }
 function change(patch:Partial<GuidedSupport>){
  const value=guidedSupportSchema.parse({...support,...patch});
  onChange({workspace:{...project.workspace,guidedSupport:value}});
  setNotice("Condição construtiva alterada. A análise exige apoios físicos verificados.");
 }
 function beginSketch(){
  if([project.roof.widthM,project.roof.lengthM,project.roof.lowHeightM,project.roof.slopePercent].some(x=>x===null)){
   setNotice("Informe largura, comprimento, altura e inclinação no formulário abaixo antes de começar o esboço.");return;
  }
  if(project.roof.lowHeightM!<=.3){setNotice("A altura precisa ser maior que 0,30 m para esse desenho inicial.");return;}
  const next=applyGuidedSketch(project,{
   widthM:project.roof.widthM,lengthM:project.roof.lengthM,lowHeightM:project.roof.lowHeightM,slopePercent:project.roof.slopePercent,
   typology:p.typology,frameSpacingM:Math.min(5,project.roof.lengthM!),purlinSpacingM:Math.min(1.5,project.roof.widthM!),
   trussDepthM:Math.min(.8,project.roof.lowHeightM!/3),panels:6,support
  });
  onChange(next);setNotice("Malha ilustrativa preenchida. Ajuste espaçamentos e painéis na etapa Estrutura. NÃO é dimensionamento.");
 }
 const issue=guidedSupportIssue({workspace:{...project.workspace,guidedSupport:support}});
 return <section className={css.wizard} data-testid="guided-roof-setup" aria-label="Configuração guiada da cobertura">
   <div className={css.heading}><div><span className={css.eyebrow}>CONFIGURAÇÃO GUIADA</span><h2>Como é a cobertura que você vai fazer?</h2><p>Escolha pelos desenhos. Pode alterar tudo depois, sem precisar saber termos de cálculo.</p></div><span className={css.stepBadge}>Esboço · não dimensionado</span></div>
   <div className={css.division}><h3>1. Formato do telhado</h3><p className={css.explain}>Qual formato você costuma montar?</p>
    <div className={css.roofGrid}>{([{type:"mono",title:"Uma água",caption:"Caimento para um lado"},{type:"gable",title:"Duas águas",caption:"Caimento dos dois lados"}] as const).map(v=><button key={v.type} type="button" aria-pressed={p.typology===v.type} data-testid={"roof-type-"+v.type} className={css.tile} onClick={()=>{onChange({planning:{...p,typology:v.type}});setNotice("Formato registrado. Ele não define a resistência da estrutura.");}}>
      <RoofIcon gable={v.type==="gable"}/><strong>{v.title}</strong><small>{v.caption}</small>
    </button>)}</div>
   </div>
   <div className={css.division}><h3>2. Onde a cobertura vai se apoiar?</h3><p className={css.explain}>Algumas obras já têm paredes ou vigas de concreto e não precisam de pilares novos em todos os lados.</p>
    <div className={css.optionGrid}>{arrangements.map(key=>{const a=guidedArrangements[key];return <button key={key} type="button" className={css.tile} aria-pressed={current?.arrangement===key} data-testid={"support-option-"+key} onClick={()=>choose(key)}>
      <SupportIcon left={a.left} right={a.right} coverage={a.coverage} gable={p.typology==="gable"}/>
      <strong>{a.title}</strong><small>{a.description}</small>
    </button>;})}</div>
    {current?<div className={css.refinement}><div className={css.refineHead}><strong>Personalize os dois lados</strong><span>Informação construtiva, não cálculo</span></div>
       <div className={css.columns}><label>Lado A<select className="input" data-testid="support-side-a" value={support.left} onChange={e=>change({left:e.target.value as GuidedSupport["left"]})}>{edges.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
       <label>Lado B<select className="input" data-testid="support-side-b" value={support.right} onChange={e=>change({right:e.target.value as GuidedSupport["right"]})}>{edges.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
       <label>Área coberta<select className="input" data-testid="support-coverage" value={support.coverage} onChange={e=>change({coverage:e.target.value as GuidedSupport["coverage"]})}><option value="whole">Cobertura completa</option><option value="partial">Somente parte / ampliação</option></select></label></div>
       <label className={css.noteLabel}>O que já existe na obra? (opcional)<textarea className="input" maxLength={1200} value={support.note} placeholder="Ex.: parede de blocos do lado esquerdo; viga de concreto no fundo..." onChange={e=>change({note:e.target.value})}/></label>
       <div className={css.concept}><SupportIcon left={support.left} right={support.right} coverage={support.coverage} gable={p.typology==="gable"} large/><div><strong>Como o JPN entendeu sua escolha</strong><p>{issue??"Esboço paramétrico com pilares metálicos nos dois lados. Posições, seções e cargas ainda precisam de verificação."}</p><p>Uma parede existente só serve como apoio de cálculo depois de verificar sua capacidade, ligação e posição.</p></div></div>
      </div>:<p className={css.hint}>Escolha uma opção para registrar o tipo de apoio. Projetos antigos continuam sem alterações até você escolher.</p>}
   </div>
   <div className={css.division}><h3>3. Medidas e distribuição</h3><p className={css.explain}>Preencha as medidas no formulário abaixo. Para começar a desenhar, use uma malha geométrica inicial, editável na etapa Estrutura.</p>
    <button type="button" className="button secondary" data-testid="guided-starter" onClick={beginSketch}>Preencher malha geométrica ilustrativa</button>
    <p className={css.hint}>Essa malha usa até 5 m entre tesouras, 1,5 m entre terças e 6 painéis. É apenas um exemplo visual, <strong>não é a opção mais segura ou econômica</strong>.</p>
    <button className={css.detailsButton} type="button" onClick={()=>setGlossaryOpen(v=>!v)} aria-expanded={glossaryOpen}>Entenda as peças: banzos, diagonais, montantes e terças {glossaryOpen?"−":"+"}</button>
    {glossaryOpen&&<div className={css.glossary}><div><strong>Banzo superior</strong><span>Barra de cima da tesoura.</span></div><div><strong>Banzo inferior</strong><span>Barra de baixo.</span></div><div><strong>Diagonal</strong><span>Barra inclinada dentro da tesoura.</span></div><div><strong>Montante</strong><span>Barra vertical dentro da tesoura.</span></div><div><strong>Terça</strong><span>Barra que liga uma tesoura à outra e sustenta as telhas.</span></div></div>}
   </div>
   <p className={css.technicalWarning}><strong>Importante:</strong> estas escolhas não verificam a resistência de paredes, vigas ou fundações. O JPN não vai inventar pilares, perfis ou apoios de cálculo. Fabricação não liberada.</p>
   {notice&&<p role="status" className={css.feedback}>{notice}</p>}
 </section>;
}
