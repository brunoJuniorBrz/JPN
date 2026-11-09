import {describe,expect,it} from "vitest";
import {mixedRequestSchema} from "./mixed-analysis";
import {loadedMixedRequestSchema} from "./structural-loading";
const base={
  schema_version:"jpn.mixed3d/1",units:"SI",theory:"linear-elastic-frame-axial",
  project:{id:"TEST",revision:"R1",source:"Analytical trace"},
  nodes:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:2,y_m:0,z_m:0}],
  materials:[{id:"M",e_pa:200e9,g_pa:200e9/(2*1.3),nu:.3,source:"E synthetic",revision:"R1"}],
  sections:[{id:"S",area_m2:.01,iy_m4:1e-5,iz_m4:1e-5,j_m4:1e-5,source:"Synthetic",revision:"R1"}],
  members:[{id:"BEAM",start:"A",end:"B",kind:"frame",material:"M",section:"S",
    rotation_deg:0,release_start:[false,false,false,false,false,false],
    release_end:[false,false,false,false,false,false]}],
  supports:[{node:"A",restrained:[true,true,true,true,true,true]}],
  cases:[{id:"L",source:"Test"}],combinations:[{id:"LC",factors:{L:1}}],
  nodal_loads:[{node:"B",case:"L",fx_n:0,fy_n:0,fz_n:-1000,mx_nm:0,my_nm:0,mz_nm:0}],
};
describe("Homogeneous and mixed physical topologies",()=>{
 it("supports frame-only without a dummy axial element",()=>{
   const r=mixedRequestSchema.parse(base);
   expect(r.members).toHaveLength(1);
   expect(r.members[0].kind).toBe("frame");
 });
 it("supports axial-only with genuine translational supports, no frames",()=>{
   const m={...base,members:[{id:"BAR",start:"A",end:"B",kind:"axial",e_pa:200e9,
       area_m2:.001,source:"Analytical EA",revision:"R1"}],
       materials:[],sections:[],
       supports:[{node:"A",restrained:[true,true,true,false,false,false]},
                 {node:"B",restrained:[false,true,true,false,false,false]}],
       nodal_loads:[{...base.nodal_loads[0],fx_n:1000,fz_n:0}]};
   expect(mixedRequestSchema.safeParse(m).success).toBe(true);
   expect(mixedRequestSchema.safeParse({...m,
     supports:[...m.supports.slice(0,1),{node:"B",restrained:[false,true,true,true,false,false]}]}).success).toBe(false);
   expect(mixedRequestSchema.safeParse({...m,
     nodal_loads:[{...m.nodal_loads[0],my_nm:1}]}).success).toBe(false);
 });
 it("supports loaded frame-only under version 2 without forced axial",()=>{
   const m={...base,schema_version:"jpn.mixed3d/2",nodal_loads:[],
     member_loads:[{id:"Q",member:"BEAM",case:"L",coordinate_system:"global",
       force_per_length_n_m:[0,0,-100],source:"Known force",revision:"R1"}],self_weight:null};
   expect(loadedMixedRequestSchema.safeParse(m).success).toBe(true);
 });
 it("rejects zero members and unknown node references",()=>{
   expect(mixedRequestSchema.safeParse({...base,members:[]}).success).toBe(false);
   expect(mixedRequestSchema.safeParse({...base,members:[{...base.members[0],end:"MISSING"}]}).success).toBe(false);
 });
});
