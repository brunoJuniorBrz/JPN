import type {Project} from "@/domain/models";
import {declaredTakeoff} from "@/domain/declared-takeoff";
import {restoreMixedAnalysis} from "@/domain/restore-mixed-analysis";
import {structureSignature} from "@/domain/calculations/project-basis";
import {cadNumber} from "./cad-book";

export type CadPiece=NonNullable<Project["workspace"]["physicalStructure"]>["pieces"][number];
export type CadNode=NonNullable<Project["workspace"]["physicalStructure"]>["nodes"][number];
export const axisLetter=(index:number):string=>{let s="";for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export const sortedCoordinates=(values:number[])=>[...new Set(values)].sort((a,b)=>a-b);
export const isDeclaredBrace=(p:CadPiece)=>/contravent|brac|tirante/i.test(`${p.label??""} ${p.group??""}`);

export function cadModel(project:Project){
  const model=project.workspace.physicalStructure!,draft=project.workspace.spatialPreparation,takeoff=declaredTakeoff(project);
  const nodes=new Map(model.nodes.map(n=>[n.id,n])),rows=new Map(takeoff.pieces.map(p=>[p.pieceId,p]));
  const assignment=(p:CadPiece)=>draft?.physicalCatalog?.assignments.find(a=>a.pieceId===p.id);
  const connections=(p:CadPiece)=>{
    const c=draft?.memberConnections.find(c=>c.pieceId===p.id),fallback=draft?.groups[p.role]?.connection??"pending";
    return {start:!c||c.start==="inherit"?fallback:c.start,end:!c||c.end==="inherit"?fallback:c.end};
  };
  const profile=(id:string)=>{
    const p=model.pieces.find(p=>p.id===id)!,sectionId=assignment(p)?.sectionId;
    return draft?.physicalCatalog?.sections.find(s=>s.id===sectionId)?.designation?.trim()||`PENDENTE [${sectionId??rows.get(id)?.sectionId??"sem seção"}]`;
  };
  const supports=(draft?.supports??[]).filter(s=>s.dofs.some(d=>d==="fixed")).flatMap(s=>nodes.has(s.nodeId)?[nodes.get(s.nodeId)!]:[]);
  const currentJunctions=draft?.connectivity?.geometrySignature===structureSignature(project)?draft.connectivity.junctions:[];
  type Frame={axis:"x"|"y";coordinate:number;pieces:CadPiece[];kind:"TESOURA"|"PORTICO";key:string};
  const frames:Frame[]=[];
  for(const axis of ["y","x"] as const){
    const planes=new Map<number,CadPiece[]>();
    for(const p of model.pieces){
      if(p.role==="purlin")continue;
      const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
      if(a[axis]!==b[axis])continue;
      const members=planes.get(a[axis])??[];members.push(p);planes.set(a[axis],members);
    }
    for(const [coordinate,plane] of planes){
      // Connectivity is explicit: common node IDs or a reviewed interior junction.
      const remaining=new Set(plane);
      while(remaining.size){
        const component:CadPiece[]=[remaining.values().next().value!];remaining.delete(component[0]);
        for(let cursor=0;cursor<component.length;cursor++){
          const p=component[cursor];
          for(const q of remaining){
            const joint=currentJunctions.some(j=>j.decision==="connect"&&j.pieceIds.includes(p.id)&&j.pieceIds.includes(q.id));
            if([p.start,p.end].some(id=>id===q.start||id===q.end)||joint){component.push(q);remaining.delete(q);}
          }
        }
        const h=axis==="y"?"x":"y",ns=component.flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]);
        const minH=Math.min(...ns.map(n=>n[h]));
        if(component.length<2||!ns.some(n=>n[h]!==minH)||!ns.some(n=>n.z!==ns[0].z))continue;
        const coordinates=(id:string)=>{const n=nodes.get(id)!;return [n[h]-minH,n.z];};
        const parts=component.map(p=>({a:coordinates(p.start),b:coordinates(p.end),role:p.role,brace:isDeclaredBrace(p),assignment:assignment(p)??null,
          connections:connections(p),
          kind:draft?.memberKinds?.find(k=>k.pieceId===p.id)?.kind??draft?.groups[p.role]?.elementKind??"pending"}));
        // Piece/node IDs are locators, not geometry. Keep actual profile, orientation, steel and endpoint conditions.
        const normalized=parts.map(p=>({...p,assignment:p.assignment?{material:p.assignment.materialId,section:p.assignment.sectionId,rotation:p.assignment.rotationDeg}:null,
          connections:typeof p.connections==="object"?{start:p.connections.start,end:p.connections.end}:p.connections})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const boundary=ns.filter((n,i)=>ns.findIndex(v=>v.id===n.id)===i).flatMap(n=>{
          const s=draft?.supports.find(s=>s.nodeId===n.id);return s?[{at:coordinates(n.id),dofs:s.dofs}]:[];
        }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const known=boundary.every(b=>b.dofs.every(d=>d!=="pending"))&&component.every(p=>{
          const a=assignment(p),material=draft?.physicalCatalog?.materials.find(m=>m.id===a?.materialId),section=draft?.physicalCatalog?.sections.find(s=>s.id===a?.sectionId),ends=connections(p);
          return !!a&&!profile(p.id).startsWith("PENDENTE")&&a.rotationDeg!==null&&
            !!material?.steelGrade.trim()&&!!material.materialSource.trim()&&!!material.materialRevision.trim()&&
            !!section?.sectionSource.trim()&&!!section.sectionRevision.trim()&&
            ends.start!=="pending"&&ends.end!=="pending";
        });
        const kind=component.some(p=>p.role==="bottomChord")&&component.some(p=>p.role==="topChord")?"TESOURA":"PORTICO";
        frames.push({axis,coordinate,pieces:component,kind,key:known?JSON.stringify({axis,normalized,boundary}):`unknown:${axis}:${coordinate}:${component[0].id}`});
      }
    }
  }
  const frameGroups=[...new Set(frames.map(f=>f.key))].map(key=>frames.filter(f=>f.key===key));
  const columns=model.pieces.filter(p=>p.role==="column").flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]);
  const anchors=[...supports,...columns];
  const extent=(axis:"x"|"y")=>[Math.min(...model.nodes.map(n=>n[axis])),Math.max(...model.nodes.map(n=>n[axis]))];
  const xs=sortedCoordinates([...(anchors.length?anchors.map(n=>n.x):extent("x")),...frames.filter(f=>f.axis==="x").map(f=>f.coordinate)]);
  const ys=sortedCoordinates([...(anchors.length?anchors.map(n=>n.y):extent("y")),...frames.filter(f=>f.axis==="y").map(f=>f.coordinate)]);
  const location=(n:CadNode)=>`${xs.includes(n.x)?axisLetter(xs.indexOf(n.x)):"X="+cadNumber(n.x)} / ${ys.includes(n.y)?ys.indexOf(n.y)+1:"Y="+cadNumber(n.y)}`;
  return {model,draft,takeoff,nodes,rows,profile,supports,frames,frameGroups,xs,ys,location};
}

type ReactionRow={nodeId:string;combinationId:string;force:number[];moment:number[]};
type ReactionData={projectSignature:string;inputSha256:string;order:string;rows:ReactionRow[]};
/** An opaque, in-memory receipt. JSON imports cannot manufacture a verified receipt. */
export type CadReactionReceipt=Readonly<{inputSha256:string}>;
const receipts=new WeakMap<CadReactionReceipt,ReactionData>();

/** Reuses the existing current-model/hash/trace checks, without changing the synchronous export entry point.
 * Imported experimental results remain experimental; this is not independent solver or capacity approval. */
export async function prepareCadReactions(project:Project,packetText:string):Promise<CadReactionReceipt>{
  const restored=await restoreMixedAnalysis(project,packetText),supports=project.workspace.spatialPreparation?.supports??[];
  const rows:ReactionRow[]=[];
  for(const [combinationId,c] of Object.entries(restored.result.combinations))for(const s of supports){
    if(!s.dofs.some(d=>d==="fixed"))continue;
    const n=c.nodes[s.nodeId];
    if(!n||![...n.reaction_force_n,...n.reaction_moment_nm].every(Number.isFinite))throw Error("CAD_REACTION_MISSING: "+s.nodeId+" / "+combinationId);
    rows.push({nodeId:s.nodeId,combinationId,force:[...n.reaction_force_n],moment:[...n.reaction_moment_nm]});
  }
  const receipt=Object.freeze({inputSha256:restored.prepared.input_sha256});
  receipts.set(receipt,{projectSignature:JSON.stringify(project),inputSha256:receipt.inputSha256,
    order:"analysis_order" in restored.result?"segunda ordem experimental":"linear experimental",rows});
  return receipt;
}
export function cadReactions(project:Project,receipt?:CadReactionReceipt){
  const data=receipt&&receipts.get(receipt);
  if(!data)return {status:"PENDENTE: reações não fornecidas/conferidas para o modelo atual.",data:null};
  if(data.projectSignature!==JSON.stringify(project))return {status:"PENDENTE: resultado desatualizado; modelo ou declaração alterados.",data:null};
  return {status:`Reações globais, ${data.order}; origem importada não homologada; input_sha256=${data.inputSha256}`,data:structuredClone(data)};
}
