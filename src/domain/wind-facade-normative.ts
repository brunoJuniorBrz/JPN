import {z} from "zod";
import table from "../../data/normas/nbr6123-2023-wall-cpe.json" with {type:"json"};
import {calculateWindSpeed,windSpeedInputSchema} from "./wind-speed";
import {declaredFacadeTractionSchema,declaredFacadeTractionSignature} from "./declared-facade-traction";
import type {DeclaredFacadeTraction} from "./declared-facade-traction";
import type {Project} from "./models";
import {facadeOrientationSchema,toFacadeLocal,fromFacadeLocal} from "./physical-facades";
import type {FacadeOrientation} from "./physical-facades";
import {assertDominant,classifyOpeningSpan,solveDetailedCpi,highSuctionDominantCpi,highSuctionStripM,sealedCpiAlternatives,windwardDominantCpi} from "./wind-internal-pressure";

/** M41-P4/P5: NBR 6123:2023 Tabela 6 (all wall zones) + 6.3.2.1 a)/b)
 * internal pressure -> net pressure per physical facade, emitted as the
 * EXISTING declared-facade-traction input (uniform for windward/leeward walls,
 * piecewise `profile` for walls parallel to the wind), so loads reuse the
 * audited column path. Dominant openings and other domains are blocked.
 * Table 6 cells listed in data `unverifiedCells` are only used when the
 * responsible engineer confirms the value (coefficientConfirmations); the
 * list is empty after the cell-by-cell check against a sharp copy, but the
 * gate stays active. Professional normative review remains pending. */
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/);
const axis=(o:FacadeOrientation)=>o.endsWith("X")?"X":"Y";
const opposite=(o:FacadeOrientation):FacadeOrientation=>(o.startsWith("+")?"-":"+")+o[1] as FacadeOrientation;
const area=z.number().finite().positive().max(1e6),areaOrZero=z.number().finite().min(0).max(1e6);
const span=z.tuple([z.number().finite().min(0),z.number().finite().min(0)]);
/** Areas are DECLARED inputs (not verified against facade geometry); walls with physical
 * openings remain blocked by the facade distribution path. */
const dominantBase={otherFacesEquallyPermeable:z.literal(true),dominantOpeningAreaM2:area,otherOpeningsTotalAreaM2:areaOrZero};
const internalSchema=z.discriminatedUnion("rule",[
  z.object({rule:z.literal("two-opposite-faces-equally-permeable"),permeableAxis:z.enum(["X","Y"])}).strict(),
  z.object({rule:z.literal("four-faces-equally-permeable")}).strict(),
  z.object({rule:z.literal("sealed-building"),characterization:z.string().trim().min(20).max(1000)}).strict(),
  z.object({rule:z.literal("dominant-opening-windward"),...dominantBase,
    windwardFaceOpeningsAreaM2:area,suctionFacesOpeningsAreaM2:area}).strict(),
  z.object({rule:z.literal("dominant-opening-parallel"),...dominantBase,openingSpanFromWindwardEdgeM:span,
    highSuction:z.object({openingsInZoneAreaM2:area,otherSuctionFacesOpeningsAreaM2:area}).strict().optional()}).strict(),
  z.object({rule:z.literal("dominant-opening-ce-fallback"),...dominantBase,
    permeabilityRatioIndeterminate:z.string().trim().min(20).max(1000),
    location:z.discriminatedUnion("wall",[z.object({wall:z.literal("windward")}).strict(),
      z.object({wall:z.literal("parallel"),spanFromWindwardEdgeM:span}).strict()])}).strict(),
  z.object({rule:z.literal("dominant-opening-leeward"),...dominantBase,
    /** 6.3.2.1 c) cites "Tabela 4", which in this edition is the S3 table; the engineer confirms the
     * intended reference is the leeward wall Ce of Tabela 6 (D / B). */
    leewardTableReferenceResolved:z.literal(true)}).strict(),
  z.object({rule:z.literal("detailed-flow-balance"),
    openings:z.array(z.object({id,areaM2:area,ce:z.discriminatedUnion("from",[
      z.object({from:z.literal("windward")}).strict(),z.object({from:z.literal("leeward")}).strict(),
      z.object({from:z.literal("parallel"),spanFromWindwardEdgeM:span}).strict(),
      z.object({from:z.literal("declared"),value:z.number().finite().min(-5).max(5),source:z.string().trim().min(10).max(500)}).strict()])
    }).strict()).min(2).max(40)}).strict(),
  z.object({rule:z.literal("cylindrical-open-top")}).strict(),
]);
type Internal=z.infer<typeof internalSchema>;
export const normativeWallWindSchema=z.object({
  schema_version:z.literal("jpn.nbr6123-wall-wind/2"),
  building:z.object({
    longSideM:z.number().finite().positive().max(1000),   // a
    shortSideM:z.number().finite().positive().max(1000),  // b
    heightM:z.number().finite().positive().max(500),      // h
    longAxis:z.enum(["X","Y"]),
    roofImpermeable:z.literal(true),
    /** Tabela 6 Nota 1: h follows Detalhe I of Tabela 7 (not supplied here) - declared by the engineer. */
    heightDefinitionConfirmed:z.literal(true),
    /** Detalhe I (Tabela 7): h is measured from the ground to the eave; overhang must be <= 0.1 b. */
    eaveOverhangM:z.number().finite().min(0).max(100).default(0),
  }).strict(),
  speed:windSpeedInputSchema,
  /** Engineer's confirmation, from the printed standard, of every unverified Table 6 cell used. */
  coefficientConfirmations:z.array(z.object({cell:z.string().max(40),value:z.number().finite()}).strict()).max(64).default([]),
  cases:z.array(z.object({
    id,windFrom:facadeOrientationSchema,
    internalPressure:internalSchema,
  }).strict()).min(1).max(5),
}).strict();

type Band="lo"|"hi";
type Cell="A1B1"|"A2B2"|"C"|"D"|"A"|"B"|"C1D1"|"C2D2";
function fail(c:string,m:string):never{throw Error(c+": "+m);}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

export type CoefficientLookup={value:number;cells:{id:string;value:number;blurred:boolean}[];row:string;band:string};
function rowFor(hOverB:number,aOverB:number){
  if(!(aOverB>=1&&aOverB<=4)||!(hOverB>0&&hOverB<=6))
    fail("WIND_TABLE6_DOMAIN","Tabela 6 cobre 1<=a/b<=4 e 0<h/b<=6; recebido a/b="+aOverB+", h/b="+hOverB);
  return table.table6.heightRows[hOverB<=0.5?0:hOverB<=1.5?1:2];
}
const cellRef=(row:{id:string;bands:Record<Band,Record<string,number>>},band:Band,cell:string)=>{
  const id=row.id+"/"+band+"/"+cell,value=row.bands[band][cell];
  return {id,value,blurred:(table.unverifiedCells as string[]).includes(id)};
};
/** Gate: every unverified cell used needs an engineer confirmation equal to the transcription. */
export function checkCellConfirmations(cells:{id:string;value:number;blurred:boolean}[],confirmed:Map<string,number>){
  for(const c of cells){
    if(!c.blurred)continue;
    const v=confirmed.get(c.id);
    if(v===undefined)fail("WIND_COEFFICIENT_UNCONFIRMED",c.id+" não verificada; confirme "+c.value+" na norma impressa");
    if(Math.abs(v-c.value)>1e-9)fail("WIND_COEFFICIENT_CONFIRMATION_MISMATCH",c.id+": confirmado "+v+" ≠ transcrito "+c.value+"; corrigir os dados antes de usar");
  }
}
/** Tabela 6 cell for a/b and h/b; interpolation per Nota 2 between bands. */
export function table6Coefficient(cell:Cell,aOverB:number,hOverB:number):CoefficientLookup{
  const row=rowFor(hOverB,aOverB) as {id:string;bands:Record<Band,Record<string,number>>};
  const lo=cellRef(row,"lo",cell),hi=cellRef(row,"hi",cell);
  if(aOverB<=1.5)return {value:lo.value,cells:[lo],row:row.id,band:"1-3/2"};
  if(aOverB>=2)return {value:hi.value,cells:[hi],row:row.id,band:"2-4"};
  return {value:lerp(lo.value,hi.value,(aOverB-1.5)/.5),cells:[lo,hi],row:row.id,band:"interpolated 3/2<a/b<2 (Nota 2)"};
}
/** Nota 3: A3/B3 (wind at 0 deg): a/b=1 as A2/B2; a/b>=2 -> -0.2; linear between. */
export function a3b3Coefficient(aOverB:number,hOverB:number):CoefficientLookup{
  const row=rowFor(hOverB,aOverB) as {id:string;bands:Record<Band,Record<string,number>>};
  const a2=cellRef(row,"lo","A2B2"),far=table.table6.nota3.a3b3AtLargeRatio,t=Math.min(1,aOverB-1);
  return {value:lerp(a2.value,far,t),cells:t>=1?[]:[a2],row:row.id,band:"Nota 3"};
}
/** Back-compat summary of the windward/leeward cells. */
export function wallExternalCoefficients(aOverB:number,hOverB:number){
  const c={C:table6Coefficient("C",aOverB,hOverB),D:table6Coefficient("D",aOverB,hOverB),
    A:table6Coefficient("A",aOverB,hOverB),B:table6Coefficient("B",aOverB,hOverB)};
  return {C:c.C.value,D:c.D.value,A:c.A.value,B:c.B.value,row:c.C.row,band:c.C.band};
}
export type ParallelZone={zone:string;startM:number;endM:number;lookup:CoefficientLookup};
/** Zones of a wall parallel to the wind, measured from its WINDWARD edge (m). */
export function parallelWallZones(alpha:0|90,a:number,b:number,h:number):ParallelZone[]{
  const aOverB=a/b,hOverB=h/b;
  if(alpha===0){
    const l1=Math.min(Math.max(b/3,a/4),2*h);
    return [{zone:"A1B1",startM:0,endM:l1,lookup:table6Coefficient("A1B1",aOverB,hOverB)},
      {zone:"A2B2",startM:l1,endM:a/2,lookup:table6Coefficient("A2B2",aOverB,hOverB)},
      {zone:"A3B3",startM:a/2,endM:a,lookup:a3b3Coefficient(aOverB,hOverB)}].filter(z=>z.endM>z.startM);
  }
  const l1=Math.min(2*h,b/2);
  return [{zone:"C1D1",startM:0,endM:l1,lookup:table6Coefficient("C1D1",aOverB,hOverB)},
    {zone:"C2D2",startM:l1,endM:b,lookup:table6Coefficient("C2D2",aOverB,hOverB)}];
}
export function internalPressureCoefficients(rule:"two-opposite-faces-equally-permeable"|"four-faces-equally-permeable",
  windAxis:"X"|"Y",permeableAxis?:"X"|"Y"):number[]{
  const ip=table.internalPressure;
  if(rule==="four-faces-equally-permeable")return [...ip.fourFacesEquallyPermeable.alternatives];
  if(!permeableAxis)fail("WIND_CPI_INPUT","eixo das faces permeáveis é obrigatório");
  return [windAxis===permeableAxis?ip.twoOppositeFacesEquallyPermeable.windPerpendicularToPermeableFace
    :ip.twoOppositeFacesEquallyPermeable.windPerpendicularToImpermeableFace];
}
/** Tabela 6 cpe médio (Nota 4): classification / local checks only; never replaces zone Cpe. */
export function cpeMedioCoefficient(aOverB:number,hOverB:number){
  const row=rowFor(hOverB,aOverB),m=table.table6.cpeMedio[row.id as "H1"|"H2"|"H3"];
  return aOverB<=1.5?m.lo:aOverB>=2?m.hi:lerp(m.lo,m.hi,(aOverB-1.5)/.5);
}
type Scenario={cpi:number;basis:string;cells:CoefficientLookup["cells"]};
type Ctx={windAxis:"X"|"Y";alpha:0|90;a:number;b:number;h:number;wLook:CoefficientLookup;lLook:CoefficientLookup;zones:ParallelZone[]};
function parallelCe(sp:[number,number],ctx:Ctx){
  const wallM=ctx.alpha===0?ctx.a:ctx.b,cls=classifyOpeningSpan(sp,wallM,highSuctionStripM(ctx.b,ctx.h));
  const zone=ctx.zones.find(z=>sp[0]>=z.startM-1e-9&&sp[1]<=z.endM+1e-9);
  return {cls,zone};
}
function internalScenarios(ip:Internal,ctx:Ctx):Scenario[]{
  switch(ip.rule){
    case "two-opposite-faces-equally-permeable":
    case "four-faces-equally-permeable":
      return internalPressureCoefficients(ip.rule,ctx.windAxis,ip.rule==="two-opposite-faces-equally-permeable"?ip.permeableAxis:undefined)
        .map(cpi=>({cpi,basis:ip.rule==="four-faces-equally-permeable"?"6.3.2.1 b)":"6.3.2.1 a)",cells:[]}));
    case "sealed-building":
      return sealedCpiAlternatives().map(cpi=>({cpi,basis:"6.3.2.2 (caracterizado: "+ip.characterization.slice(0,80)+")",cells:[]}));
    case "dominant-opening-windward":{
      assertDominant(ip.dominantOpeningAreaM2,ip.otherOpeningsTotalAreaM2);
      if(ip.windwardFaceOpeningsAreaM2<ip.dominantOpeningAreaM2)fail("WIND_CPI_AREAS","aberturas a barlavento menores que a dominante");
      const ratio=ip.windwardFaceOpeningsAreaM2/ip.suctionFacesOpeningsAreaM2;
      return [{cpi:windwardDominantCpi(ratio),basis:"6.3.2.1 c) barlavento, razão "+ratio,cells:[]}];
    }
    case "dominant-opening-parallel":{
      assertDominant(ip.dominantOpeningAreaM2,ip.otherOpeningsTotalAreaM2);
      const {cls,zone}=parallelCe(ip.openingSpanFromWindwardEdgeM,ctx);
      if(cls==="high-suction"){
        if(!ip.highSuction)return fail("WIND_CPI_HIGH_SUCTION_AREAS_REQUIRED","abertura em zona de alta sucção exige as áreas highSuction");
        if(ip.highSuction.openingsInZoneAreaM2<ip.dominantOpeningAreaM2)fail("WIND_CPI_AREAS","aberturas na zona menores que a dominante");
        const ratio=ip.highSuction.openingsInZoneAreaM2/ip.highSuction.otherSuctionFacesOpeningsAreaM2;
        return [{cpi:highSuctionDominantCpi(ratio),basis:"6.3.2.1 c) paralela em zona de alta sucção, razão "+ratio,cells:[]}];
      }
      if(!zone)return fail("WIND_CPI_OPENING_STRADDLES_ZONE","abertura cruza zonas da Tabela 6");
      return [{cpi:zone.lookup.value,basis:"6.3.2.1 c) paralela fora da alta sucção: Ce de "+zone.zone,cells:zone.lookup.cells}];
    }
    case "dominant-opening-ce-fallback":{
      assertDominant(ip.dominantOpeningAreaM2,ip.otherOpeningsTotalAreaM2);
      if(ip.location.wall==="windward")
        return [{cpi:ctx.wLook.value,basis:"6.3.2.1 c) Ce da face de barlavento (razão indeterminada)",cells:ctx.wLook.cells}];
      const {cls,zone}=parallelCe(ip.location.spanFromWindwardEdgeM,ctx);
      if(cls==="high-suction")return fail("WIND_CPI_FALLBACK_HIGH_SUCTION_AMBIGUOUS","Ce de zona x cpe médio não resolvido pela norma fornecida");
      if(!zone)return fail("WIND_CPI_OPENING_STRADDLES_ZONE","abertura cruza zonas da Tabela 6");
      return [{cpi:zone.lookup.value,basis:"6.3.2.1 c) Ce de "+zone.zone+" (razão indeterminada)",cells:zone.lookup.cells}];
    }
    case "dominant-opening-leeward":
      assertDominant(ip.dominantOpeningAreaM2,ip.otherOpeningsTotalAreaM2);
      return [{cpi:ctx.lLook.value,basis:"6.3.2.1 c) sotavento: Ce da parede de sotavento (Tabela 6; remissão 'Tabela 4' = S3 é referência desatualizada)",cells:ctx.lLook.cells}];
    case "cylindrical-open-top":
      return fail("WIND_CPI_CYLINDRICAL_OUT_OF_DOMAIN","6.3.2.3 pertence a edificações cilíndricas, fora do módulo retangular");
    case "detailed-flow-balance":{
      const cells:CoefficientLookup["cells"]=[];
      const items=ip.openings.map(o=>{
        let ce:number;
        if(o.ce.from==="windward"){ce=ctx.wLook.value;cells.push(...ctx.wLook.cells);}
        else if(o.ce.from==="leeward"){ce=ctx.lLook.value;cells.push(...ctx.lLook.cells);}
        else if(o.ce.from==="declared")ce=o.ce.value;
        else{
          const {cls,zone}=parallelCe(o.ce.spanFromWindwardEdgeM,ctx);
          if(cls==="high-suction")return fail("WIND_CPI_DETAILED_HIGH_SUCTION","Ce* na faixa de alta sucção: declare o valor médio na periferia (from: declared)");
          if(!zone)return fail("WIND_CPI_OPENING_STRADDLES_ZONE","abertura cruza zonas da Tabela 6: declare Ce* médio");
          ce=zone.lookup.value;cells.push(...zone.lookup.cells);
        }
        return {areaM2:o.areaM2,ce};
      });
      const sol=solveDetailedCpi(items);
      return [{cpi:sol.cpi,basis:"6.3.3 equilíbrio de vazões, "+items.length+" aberturas, Cpi="+sol.cpi.toFixed(6)+", resíduo "+sol.residual.toExponential(1),cells}];
    }
  }
}
const f=(v:number)=>(v>0?"+":"")+v.toFixed(2).replace(/\.?0+$/,"");

/** Net pressure q*(Cpe-Cpi) [Pa], positive INWARD (declared-facade-traction convention). */
export function buildNormativeFacadeTraction(project:Project,raw:unknown){
  const input=normativeWallWindSchema.parse(raw),{building:b}=input;
  if(b.shortSideM>b.longSideM)fail("WIND_PLAN","b deve ser a menor dimensão (a>=b)");
  if(b.eaveOverhangM>0.1*b.shortSideM+1e-9)fail("WIND_EAVE_OVERHANG","beiral > 0,1 b fora do Detalhe I da Tabela 7");
  if(input.speed.heightM!==b.heightM)
    fail("WIND_SPEED_HEIGHT","q é avaliada na altura h da edificação; speed.heightM deve ser igual a h");
  const faces=project.workspace.spatialPreparation?.physicalFacades?.facades;
  if(!faces)fail("FACADE_DECLARATION_PENDING","fachadas físicas são obrigatórias");
  if(new Set(input.cases.map(c=>c.id)).size!==input.cases.length)fail("WIND_DUPLICATE_CASE","identificadores repetidos");
  for(const ax of ["X","Y"] as const){
    const pos=faces.find(x=>x.outward==="+"+ax),neg=faces.find(x=>x.outward==="-"+ax),i=ax==="X"?0:1;
    if(pos&&neg&&Math.abs(Math.abs(pos.outer[0][i]-neg.outer[0][i])/1000-(ax===b.longAxis?b.longSideM:b.shortSideM))>1e-3)
      fail("WIND_PLAN_MISMATCH","distância entre fachadas opostas em "+ax+" diverge da dimensão em planta declarada");
  }
  const confirmed=new Map(input.coefficientConfirmations.map(c=>[c.cell,c.value]));
  const used=new Set<string>();
  const need=(l:CoefficientLookup)=>{
    for(const c of l.cells)used.add(c.id);
    checkCellConfirmations(l.cells,confirmed);
  };
  const speed=calculateWindSpeed(input.speed),q=speed.dynamicPressurePa;
  const aOverB=b.longSideM/b.shortSideM,hOverB=b.heightM/b.shortSideM;
  const cases:DeclaredFacadeTraction["cases"]=[],trace:unknown[]=[];
  for(const c of input.cases){
    const windAxis=axis(c.windFrom),alpha:0|90=windAxis===b.longAxis?0:90,
      wLook=table6Coefficient(alpha===0?"C":"A",aOverB,hOverB),lLook=table6Coefficient(alpha===0?"D":"B",aOverB,hOverB),
      zonesPar=parallelWallZones(alpha,b.longSideM,b.shortSideM,b.heightM),
      scenarios=internalScenarios(c.internalPressure,{windAxis,alpha,a:b.longSideM,b:b.shortSideM,h:b.heightM,wLook,lLook,zones:zonesPar});
    for(const sc of scenarios){
      const cpi=sc.cpi;need({cells:sc.cells} as CoefficientLookup);
      const caseId=scenarios.length>1?c.id+"-CPI"+(cpi<0?"N":"P")+Math.abs(cpi*10):c.id;
      const zones=faces.map(face=>{
        if(face.kind!=="wall")return fail("WIND_FACADE_KIND_UNSUPPORTED",face.id+" não é parede (Tabela 6 cobre paredes)");
        const loc=face.outer.map(p=>toFacadeLocal(face.outward,p)),
          uMin=Math.min(...loc.map(p=>p[0])),uMax=Math.max(...loc.map(p=>p[0])),
          w=(uMax-uMin)/1000,h=(Math.max(...loc.map(p=>p[1]))-Math.min(...loc.map(p=>p[1])))/1000,
          expected=axis(face.outward)===b.longAxis?b.shortSideM:b.longSideM;
        if(Math.abs(w-expected)>1e-3||Math.abs(h-b.heightM)>1e-3)
          fail("WIND_GEOMETRY_MISMATCH",face.id+": largura "+w+" m / altura "+h+" m divergem de a, b, h declarados");
        const base={facadeId:face.id,
          source:"ABNT NBR 6123:2023 Tabela 6 (p.20) e 6.3.2.1 (p.43); transcrição data/normas/nbr6123-2023-wall-cpe.json",
          revision:table.revision+" / "+input.speed.reference.revision};
        const basis=(txt:string)=>"p=q(Cpe-Cpi); q="+q.toFixed(3)+" Pa; "+txt+"; Cpi="+f(cpi)+" ("+sc.basis+"); positivo = para dentro";
        if(face.outward===c.windFrom||face.outward===opposite(c.windFrom)){
          const windward=face.outward===c.windFrom,look=windward?wLook:lLook,col=alpha===0?(windward?"C":"D"):(windward?"A":"B");
          need(look);
          const net=q*(look.value-cpi);
          trace.push({caseId,facadeId:face.id,role:windward?"windward":"leeward",alpha,column:col,cpe:look.value,cpi,cpiBasis:sc.basis,qPa:q,netPressurePa:net});
          return {...base,netPressurePa:net,calculationBasis:basis("Cpe("+col+", α="+alpha+"°, "+look.row+" "+look.band+")="+f(look.value))};
        }
        // Wall parallel to the wind: piecewise zones from the windward edge.
        const endIdx=windAxis==="X"?0:1,sign=c.windFrom.startsWith("+")?1:-1,
          at=(u:number)=>fromFacadeLocal(face.outward,face.outer[0][axis(face.outward)==="X"?0:1],[u,0])[endIdx]*sign,
          windwardAtMin=at(uMin)>at(uMax);
        const profile=zonesPar.map(zn=>{
          need(zn.lookup);
          const net=q*(zn.lookup.value-cpi),
            startM=windwardAtMin?zn.startM:w-zn.endM,endM=windwardAtMin?zn.endM:w-zn.startM;
          trace.push({caseId,facadeId:face.id,role:"parallel",alpha,zone:zn.zone,fromWindwardM:[zn.startM,zn.endM],
            cpe:zn.lookup.value,cpi,cpiBasis:sc.basis,qPa:q,netPressurePa:net});
          return {startM,endM,netPressurePa:net,zone:zn.zone,cpe:zn.lookup.value};
        }).sort((x,y)=>x.startM-y.startM);
        const mean=profile.reduce((s,z)=>s+z.netPressurePa*(z.endM-z.startM),0)/w;
        return {...base,netPressurePa:mean,
          profile:profile.map(z=>({startM:z.startM,endM:z.endM,netPressurePa:z.netPressurePa})),
          calculationBasis:basis("zonas paralelas α="+alpha+"°: "+profile.map(z=>z.zone+" Cpe="+f(z.cpe)+" ["+z.startM.toFixed(3)+"–"+z.endM.toFixed(3)+" m]").join(", "))};
      });
      cases.push({id:caseId,incidenceDeg:{"+X":0,"+Y":90,"-X":180,"-Y":270}[c.windFrom],
        reference:"Vento vindo de "+c.windFrom+" (ângulo = lado de origem); Tabela 6 + Cpi 6.3.2.1; conferência profissional pendente",zones});
    }
  }
  const traction=declaredFacadeTractionSchema.parse({
    schema_version:"jpn.declared-facade-traction/1",normativeValidation:"pending-engineer-review",
    physicalSignature:declaredFacadeTractionSignature(project),cases});
  return {traction,trace,speed,usedCells:[...used].sort(),
    domain:"paredes de planta retangular (barlavento, sotavento e paralelas com zonas); cobertura impermeável; Cpi 6.3.2.1 a)/b)",
    blocked:table.blocked,computedStructuralApproval:false as const,fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,errataVerified:false as const};
}
