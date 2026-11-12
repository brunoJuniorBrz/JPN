import {z} from "zod";
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/);
const text=z.string().trim().min(1).max(1000);
const capacity=z.number().finite().nonnegative().max(1e12).nullable();
const direction=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()])
  .refine(v=>Math.abs(Math.hypot(...v)-1)<=1e-10,"Restraint direction must be a global unit vector");
/** Physical declarations, never implicit FE supports or normative capacities. */
export const physicalRestraintsSchema=z.object({schema_version:z.literal("jpn.physical-restraints/1"),
  geometrySignature:z.string().min(1).max(100000),
  items:z.array(z.object({id,pieceId:id,nodeId:id,positionM:z.number().finite().nonnegative().max(1e6),
    kind:z.enum(["lateral","torsional"]),directionGlobal:direction,
    binding:z.discriminatedUnion("kind",[
      z.object({kind:z.literal("support")}).strict(),
      z.object({kind:z.literal("axial-member"),pieceId:id}).strict(),
    ]),
    capacity:z.object({positive:capacity,negative:capacity,units:z.enum(["N","Nm"]),source:text,revision:text}).strict(),
    source:text,revision:text,physicalBasis:text,
  }).strict()).max(300),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.items.map(r=>r.id)).size!==v.items.length)ctx.addIssue({code:"custom",message:"Duplicate physical restraint ID"});
  for(const r of v.items)if(r.capacity.units!==(r.kind==="lateral"?"N":"Nm"))
    ctx.addIssue({code:"custom",message:"Lateral capacity requires N; torsional capacity requires Nm"});
});
export type PhysicalRestraints=z.infer<typeof physicalRestraintsSchema>;
