import { z } from "zod";
const id=z.string().min(1).max(100),text=z.string().min(1).max(1000).refine(s=>!!s.trim());
const positive=z.number().finite().positive().max(1e6).nullable(),known=z.string().max(1000).nullable();
const vec=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
const stiffness=z.tuple([z.number().finite().nonnegative().nullable(),z.number().finite().nonnegative().nullable(),z.number().finite().nonnegative().nullable()]);
const component=z.discriminatedUnion("kind",[
  z.object({id,kind:z.literal("plate"),widthMm:positive,heightMm:positive,thicknessMm:positive,material:known,source:text,revision:text}).strict(),
  z.object({id,kind:z.literal("bolts"),quantity:z.number().int().positive().max(10000).nullable(),diameterMm:positive,grade:known,arrangement:known,holesAndDistances:known,source:text,revision:text}).strict(),
  z.object({id,kind:z.literal("weld"),type:known,position:known,sizeMm:positive,lengthMm:positive,material:known,source:text,revision:text}).strict(),
  z.object({id,kind:z.literal("restraint"),pieceId:id.nullable(),description:known,source:text,revision:text}).strict(),
]);
export const connectionSchema=z.object({id,nodeId:id,
  typology:z.enum(["purlin-support","truss-joint","beam-column","column-base","splice"]),
  participants:z.array(z.object({pieceId:id,behavior:z.enum(["pending","as-modeled","rigid","pinned","axial","semi-rigid"])}).strict()).min(1).max(30),
  transferHypothesis:text,offsetGlobalM:vec.nullable(),stiffness:z.object({translationNM:stiffness,rotationNmRad:stiffness}).strict().nullable(),
  components:z.array(component).max(100),source:text,revision:text,responsible:text,
}).strict();
export const connectionsSchema=z.object({schema_version:z.literal("jpn.connections/1"),geometrySignature:z.string().min(1).max(100000),connections:z.array(connectionSchema).max(250)}).strict().superRefine((v,ctx)=>{
  const error=(message:string)=>ctx.addIssue({code:"custom",message});
  if(new Set(v.connections.map(c=>c.id)).size!==v.connections.length||new Set(v.connections.map(c=>c.nodeId)).size!==v.connections.length)error("CONNECTION_DUPLICATE: uma declaração por ID/nó, sem duplicação de ações.");
  const components=v.connections.flatMap(c=>c.components.map(p=>p.id));
  if(new Set(components).size!==components.length)error("COMPONENT_DUPLICATE: IDs físicos de componentes devem ser únicos, sem contabilização duplicada.");
  for(const c of v.connections)if(new Set(c.participants.map(p=>p.pieceId)).size!==c.participants.length)error("PARTICIPANT_DUPLICATE: peça repetida.");
});
export type ConnectionDeclaration=z.infer<typeof connectionSchema>;
export type ConnectionsDeclaration=z.infer<typeof connectionsSchema>;
