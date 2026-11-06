"use client";
import { Info } from "lucide-react";
import { ChoiceCard, EnclosureIcon, ProfileIcon, SupportIcon, TrussReferenceSketch } from "./quick-project-visuals";

type Enclosure="open"|"partial"|"closed";
type Support="columns"|"walls"|"unspecified";
type Profile="unspecified"|"channel"|"lipped-channel"|"tube";
function Choices({label,hint,value,options,onChange}:{label:string;hint:string;value:number;options:number[];onChange:(v:number)=>void}){
  return <div className="guided-spacing-control">
    <div><strong>{label}</strong><p>{hint}</p></div>
    <div className="guided-spacing-options" role="group" aria-label={label}>
      {options.map(n=><button key={n} type="button" aria-pressed={n===value} className={n===value?"is-selected":""} onClick={()=>onChange(n)}>{n.toLocaleString("pt-BR")}{label.includes("Distância")?" m":""}</button>)}
    </div>
  </div>;
}
export function GuidedPreferences({frameSpacingM,setFrameSpacingM,purlinSpacingM,setPurlinSpacingM,panels,setPanels,enclosure,setEnclosure,support,setSupport,profileInterest,setProfileInterest}:{
  frameSpacingM:number;setFrameSpacingM:(n:number)=>void;purlinSpacingM:number;setPurlinSpacingM:(n:number)=>void;panels:number;setPanels:(n:number)=>void;
  enclosure:Enclosure;setEnclosure:(x:Enclosure)=>void;support:Support;setSupport:(x:Support)=>void;profileInterest:Profile;setProfileInterest:(x:Profile)=>void;
}){
  return <>
    <section className="guided-step" aria-labelledby="guided-spacing-title">
      <div className="guided-step-head"><span className="guided-step-index">03</span><div><h3 id="guided-spacing-title">Como distribuir as peças?</h3><p>Valores iniciais para desenhar. Não representam espaçamentos aprovados.</p></div></div>
      <Choices label="Distância entre tesouras" hint="Espaço entre as estruturas principais no comprimento do barracão." value={frameSpacingM} options={[3,4,5]} onChange={setFrameSpacingM}/>
      <Choices label="Distância entre terças" hint="Espaço entre as peças que apoiam as telhas." value={purlinSpacingM} options={[1,1.5,2]} onChange={setPurlinSpacingM}/>
      <Choices label="Divisões visuais da tesoura" hint="Quantidade de painéis, não a resistência da treliça." value={panels} options={[4,6,8]} onChange={setPanels}/>
      <div className="guided-truss-reference"><TrussReferenceSketch/><p><strong>Entenda as peças:</strong> banzos são as barras externas, diagonais são inclinadas e montantes ficam em pé. O esquema é didático.</p></div>
    </section>
    <details className="quick-start-options guided-additional">
      <summary>Mais detalhes da montagem (opcionais)</summary>
      <p className="guided-additional-note"><Info size={16}/> Essas preferências não definem automaticamente perfis resistentes, ligações, apoios ou ações de vento.</p>
      <div className="guided-option-section"><h3>O barracão terá laterais fechadas?</h3>
        <div className="guided-choice-grid guided-choice-grid-three">
          {([{id:"open",name:"Aberto"},{id:"partial",name:"Parcial"},{id:"closed",name:"Fechado"}] as const).map(o=><ChoiceCard key={o.id} active={enclosure===o.id} title={o.name} onClick={()=>setEnclosure(o.id)}><EnclosureIcon kind={o.id}/></ChoiceCard>)}
        </div>
      </div>
      <div className="guided-option-section"><h3>Como pretende apoiar a cobertura?</h3>
        <div className="guided-choice-grid guided-choice-grid-three">
          {([{id:"columns",name:"Em pilares"},{id:"walls",name:"Em paredes"},{id:"unspecified",name:"Ainda não sei"}] as const).map(o=><ChoiceCard key={o.id} active={support===o.id} title={o.name} onClick={()=>setSupport(o.id)}><SupportIcon kind={o.id}/></ChoiceCard>)}
        </div>
      </div>
      <div className="guided-option-section"><h3>Perfil que costuma usar</h3><p>Preferência comercial, não uma seção calculada.</p>
        <div className="guided-choice-grid guided-choice-grid-four">
          {([{id:"unspecified",name:"A definir"},{id:"channel",name:"Perfil U"},{id:"lipped-channel",name:"U enrijecido"},{id:"tube",name:"Tubo"}] as const).map(o=><ChoiceCard key={o.id} active={profileInterest===o.id} title={o.name} onClick={()=>setProfileInterest(o.id)}><ProfileIcon kind={o.id}/></ChoiceCard>)}
        </div>
      </div>
    </details>
  </>;
}
