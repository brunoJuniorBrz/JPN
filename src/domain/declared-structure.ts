import { z } from "zod";
import { physicalRoles } from "./structure";

export const physicalId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/).refine(v=>!["constructor","prototype"].includes(v));
const source=z.string().trim().min(1).max(1000);
const coordinate=z.number().finite().min(-10000000).max(10000000);
export const declaredStructureSchema=z.object({schema_version:z.literal("jpn.declared-structure/1"),source:z.literal("declared"),
  units:z.literal("mm"),revision:source,provenance:source,
  nodes:z.array(z.object({id:physicalId,x:coordinate,y:coordinate,z:coordinate}).strict()).min(2).max(250),
  pieces:z.array(z.object({id:physicalId,start:physicalId,end:physicalId,role:z.enum(physicalRoles),label:z.string().trim().max(100).optional(),group:z.string().trim().max(100).optional()}).strict()).min(1).max(600),
}).strict().superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(new Set(v.nodes.map(n=>n.id)).size!==v.nodes.length||new Set(v.pieces.map(p=>p.id)).size!==v.pieces.length)issue("DUPLICATE_ID: nós ou barras duplicados.");
  const nodes=new Map(v.nodes.map(n=>[n.id,n])),used=new Set<string>(),edges=new Set<string>();
  for(const p of v.pieces){const a=nodes.get(p.start),b=nodes.get(p.end);
    if(!a||!b){issue(`INVALID_REFERENCE: ${p.id}: nó inexistente.`);continue;}
    const length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(!Number.isFinite(length)||length<.01||length>1000000)issue(`INVALID_GEOMETRY: ${p.id}: comprimento fora de 0,01–1000000 mm.`);
    const edge=JSON.stringify([p.start,p.end].sort());if(edges.has(edge))issue(`DUPLICATE_MEMBER: ${p.id}`);edges.add(edge);used.add(p.start);used.add(p.end);
  }
  if(v.nodes.some(n=>!used.has(n.id)))issue("ORPHAN_NODE: nó sem barra explicitamente referenciada.");
});
export type DeclaredStructure=z.infer<typeof declaredStructureSchema>;
