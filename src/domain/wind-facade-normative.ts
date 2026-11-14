import {z} from "zod";
import table from "../../data/normas/nbr6123-2023-wall-cpe.json" with {type:"json"};
import {calculateWindSpeed,windSpeedInputSchema} from "./wind-speed";
import {declaredFacadeTractionSchema,declaredFacadeTractionSignature} from "./declared-facade-traction";
import type {DeclaredFacadeTraction} from "./declared-facade-traction";
import type {Project} from "./models";
import {facadeOrientationSchema,toFacadeLocal} from "./physical-facades";
import type {FacadeOrientation} from "./physical-facades";

/** M41-P4: NBR 6123:2023 Tabela 6 (windward/leeward walls) + 6.3.2.1 a)/b)
 * internal pressure -> net pressure per physical facade, emitted as the
 * EXISTING declared-facade-traction input, so loads reach the solver through
 * the existing, audited path (no parallel engine). Parallel-to-wind walls
 * (edge zones), dominant openings and other domains are blocked, not guessed. */
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/);
const axis=(o:FacadeOrientation)=>o.endsWith("X")?"X":"Y";
const opposite=(o:FacadeOrientation):FacadeOrientation=>(o.startsWith("+")?"-":"+")+o[1] as FacadeOrientation;
export const normativeWallWindSchema=z.object({
  schema_version:z.literal("jpn.nbr6123-wall-wind/1"),
  building:z.object({
    longSideM:z.number().finite().positive().max(1000),   // a
    shortSideM:z.number().finite().positive().max(1000),  // b
    heightM:z.number().finite().positive().max(500),      // h
    longAxis:z.enum(["X","Y"]),
    roofImpermeable:z.literal(true),
  }).strict(),
  speed:windSpeedInputSchema,
  cases:z.array(z.object({
    id,windFrom:facadeOrientationSchema,
    internalPressure:z.discriminatedUnion("rule",[
      z.object({rule:z.literal("two-opposite-faces-equally-permeable"),permeableAxis:z.enum(["X","Y"])}).strict(),
      z.object({rule:z.literal("four-faces-equally-permeable")}).strict(),
    ]),
  }).strict()).min(1).max(5),
}).strict();

type Band="1-3/2"|"2-4";
type Col={C:number;D:number;A:number;B:number};
function fail(c:string,m:string):never{throw Error(c+": "+m);}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

/** Tabela 6 columns C/D/A/B for a/b and h/b; interpolation per Nota 2. */
export function wallExternalCoefficients(aOverB:number,hOverB:number):Col&{row:string;band:string}{
  if(!(aOverB>=1&&aOverB<=4)||!(hOverB>0&&hOverB<=6))
    fail("WIND_TABLE6_DOMAIN","Tabela 6 cobre 1<=a/b<=4 e 0<h/b<=6; recebido a/b="+aOverB+", h/b="+hOverB);
  const row=table.table6.heightRows[hOverB<=0.5?0:hOverB<=1.5?1:2];
  const lo=row.bands["1-3/2" as Band],hi=row.bands["2-4" as Band];
  if(aOverB<=1.5)return {...lo,row:row.id,band:"1-3/2"};
  if(aOverB>=2)return {...hi,row:row.id,band:"2-4"};
  const t=(aOverB-1.5)/.5,m=(k:keyof Col)=>lerp(lo[k],hi[k],t);
  return {C:m("C"),D:m("D"),A:m("A"),B:m("B"),row:row.id,band:"interpolated 3/2<a/b<2 (Nota 2)"};
}
export function internalPressureCoefficients(rule:"two-opposite-faces-equally-permeable"|"four-faces-equally-permeable",
  windAxis:"X"|"Y",permeableAxis?:"X"|"Y"):number[]{
  const ip=table.internalPressure;
  if(rule==="four-faces-equally-permeable")return [...ip.fourFacesEquallyPermeable.alternatives];
  if(!permeableAxis)fail("WIND_CPI_INPUT","eixo das faces permeáveis é obrigatório");
  return [windAxis===permeableAxis?ip.twoOppositeFacesEquallyPermeable.windPerpendicularToPermeableFace
    :ip.twoOppositeFacesEquallyPermeable.windPerpendicularToImpermeableFace];
}
const f=(v:number)=>(v>0?"+":"")+v.toFixed(2).replace(/\.?0+$/,"");

/** Net pressure q*(Cpe-Cpi) [Pa], positive INWARD (declared-facade-traction convention). */
export function buildNormativeFacadeTraction(project:Project,raw:unknown){
  const input=normativeWallWindSchema.parse(raw),{building:b}=input;
  if(b.shortSideM>b.longSideM)fail("WIND_PLAN","b deve ser a menor dimensão (a>=b)");
  if(input.speed.heightM!==b.heightM)
    fail("WIND_SPEED_HEIGHT","q é avaliada na altura h da edificação; speed.heightM deve ser igual a h");
  const faces=project.workspace.spatialPreparation?.physicalFacades?.facades;
  if(!faces)fail("FACADE_DECLARATION_PENDING","fachadas físicas são obrigatórias");
  const speed=calculateWindSpeed(input.speed),q=speed.dynamicPressurePa;
  const aOverB=b.longSideM/b.shortSideM,hOverB=b.heightM/b.shortSideM,cpe=wallExternalCoefficients(aOverB,hOverB);
  if(new Set(input.cases.map(c=>c.id)).size!==input.cases.length)fail("WIND_DUPLICATE_CASE","identificadores repetidos");
  const cases:DeclaredFacadeTraction["cases"]=[],trace:unknown[]=[];
  for(const c of input.cases){
    const windAxis=axis(c.windFrom),alpha=windAxis===b.longAxis?0:90,
      wCol=alpha===0?"C":"A",lCol=alpha===0?"D":"B",
      cpis=internalPressureCoefficients(c.internalPressure.rule,windAxis,
        c.internalPressure.rule==="two-opposite-faces-equally-permeable"?c.internalPressure.permeableAxis:undefined);
    for(const cpi of cpis){
      const caseId=cpis.length>1?c.id+"-CPI"+(cpi<0?"N":"P")+Math.abs(cpi*10):c.id;
      const zones=faces.map(face=>{
        const role=face.outward===c.windFrom?"windward":face.outward===opposite(c.windFrom)?"leeward":null;
        if(!role)return fail("WIND_FACADE_SIDE_ZONES_PENDING",face.id+" é paralela ao vento: zonas de borda da Tabela 6 ainda não integradas");
        if(face.kind!=="wall")return fail("WIND_FACADE_KIND_UNSUPPORTED",face.id+" não é parede (Tabela 6 cobre paredes)");
        const loc=face.outer.map(p=>toFacadeLocal(face.outward,p)),
          w=(Math.max(...loc.map(p=>p[0]))-Math.min(...loc.map(p=>p[0])))/1000,
          h=(Math.max(...loc.map(p=>p[1]))-Math.min(...loc.map(p=>p[1])))/1000,
          expected=axis(face.outward)===b.longAxis?b.shortSideM:b.longSideM;
        if(Math.abs(w-expected)>1e-3||Math.abs(h-b.heightM)>1e-3)
          fail("WIND_GEOMETRY_MISMATCH",face.id+": largura "+w+" m / altura "+h+" m divergem de a, b, h declarados");
        const col=role==="windward"?wCol:lCol,coef=cpe[col as keyof Col],net=q*(coef-cpi);
        trace.push({caseId,facadeId:face.id,role,alpha,column:col,cpe:coef,cpi,qPa:q,netPressurePa:net});
        return {facadeId:face.id,netPressurePa:net,
          source:"ABNT NBR 6123:2023 Tabela 6 (p.20) e 6.3.2.1 (p.43); transcrição data/normas/nbr6123-2023-wall-cpe.json",
          revision:table.revision+" / "+input.speed.reference.revision,
          calculationBasis:"p=q(Cpe-Cpi); q="+q.toFixed(3)+" Pa; Cpe("+col+", α="+alpha+"°, "+cpe.row+" "+cpe.band+")="+f(coef)+"; Cpi="+f(cpi)+"; positivo = para dentro"};
      });
      cases.push({id:caseId,incidenceDeg:{"+X":0,"+Y":90,"-X":180,"-Y":270}[c.windFrom],
        reference:"Vento vindo de "+c.windFrom+" (ângulo = lado de origem); Tabela 6 + Cpi 6.3.2.1; conferência profissional pendente",zones});
    }
  }
  const traction=declaredFacadeTractionSchema.parse({
    schema_version:"jpn.declared-facade-traction/1",normativeValidation:"pending-engineer-review",
    physicalSignature:declaredFacadeTractionSignature(project),cases});
  return {traction,trace,speed,
    domain:"paredes a barlavento/sotavento de planta retangular; cobertura impermeável; Cpi 6.3.2.1 a)/b)",
    blocked:table.blocked,computedStructuralApproval:false as const,fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,errataVerified:false as const};
}
