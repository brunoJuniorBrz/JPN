import { expect,it } from "vitest";
import { roofOutlineAreaM2,roofOutlineSchema } from "./roof-outline";
import { m34abProject } from "./test-support/m34ab-fixtures";
import { importPhysicalModel } from "./physical-model-import";
const fixture=()=>({schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",source:"Synthetic concave L with opening — NOT the Tom roof",revision:"1",
  outer:[[0,0],[6000,0],[6000,2000],[3000,2000],[3000,4000],[0,4000],[0,0]],holes:[[[1000,1000],[1000,1500],[2000,1500],[2000,1000],[1000,1000]]],supportPieceIds:[]});
it("uses the net polygon area (17.5m²), excluding the concavity and opening, never the 24m² bounding rectangle",()=>{
  const raw=fixture(),before=JSON.stringify(raw);expect(roofOutlineAreaM2(raw)).toBe(17.5);expect(JSON.stringify(raw)).toBe(before);
  raw.outer=raw.outer.map(([x,y])=>[x-8000,y-6000]);raw.holes=raw.holes.map(h=>h.map(([x,y])=>[x-8000,y-6000]));expect(roofOutlineAreaM2(raw)).toBe(17.5);
});
it.each(["empty","empty-hole","open","reversed","zero-edge","crossed","hole-outside","hole-touching","nested-hole","backtrack"])("refuses ambiguous or invalid outline: %s",kind=>{
  const raw=fixture();if(kind==="open")raw.outer.pop();if(kind==="reversed")raw.outer.reverse();if(kind==="zero-edge")raw.outer.splice(1,0,[0,0]);
  if(kind==="empty")raw.outer=[];if(kind==="empty-hole")raw.holes.push([]);
  if(kind==="crossed")raw.outer=[[0,0],[6000,4000],[0,4000],[6000,0],[0,0]];
  if(kind==="hole-outside")raw.holes[0]=[[7000,1000],[7000,1500],[8000,1500],[8000,1000],[7000,1000]];
  if(kind==="hole-touching")raw.holes[0]=[[0,1000],[0,1500],[2000,1500],[2000,1000],[0,1000]];
  if(kind==="nested-hole")raw.holes.push([[1100,1100],[1100,1200],[1200,1200],[1200,1100],[1100,1100]]);
  if(kind==="backtrack")raw.outer.splice(1,0,[2000,0],[1000,0]);expect(roofOutlineSchema.safeParse(raw).success).toBe(false);
});
it("imports/export preserves the separate outline and does not turn its vertices into structural nodes",()=>{
  const p=m34abProject();p.workspace.roofOutline=roofOutlineSchema.parse(fixture());const next=importPhysicalModel(p,JSON.stringify(p));expect(next.workspace.roofOutline).toEqual(p.workspace.roofOutline);expect(next.workspace.physicalStructure!.nodes).toHaveLength(4);
});
