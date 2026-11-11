import {expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {editDeclaredStructure,removeDeletedReferences} from "./edit-declared-structure";
import {roofOutlineAreaM2,roofOutlineSchema} from "./roof-outline";

const outline=()=>roofOutlineSchema.parse({schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",source:"Explicit test contour",revision:"1",outer:[[0,0],[2000,0],[2000,1000],[0,1000],[0,0]],holes:[],supportPieceIds:["F1","F2"]});
it("removing a bar removes only its contour reference, preserving polygon, surviving references and pending preparation",()=>{
  const p=m34abProject();p.workspace.roofOutline=outline();const before=JSON.stringify(p),g=structuredClone(p.workspace.physicalStructure!);
  g.pieces=g.pieces.filter(p=>p.id!=="F2");g.nodes=g.nodes.filter(n=>n.id!=="B2");g.revision="2";
  const next=editDeclaredStructure(p,g);
  expect(next.workspace.roofOutline).toEqual({...p.workspace.roofOutline,supportPieceIds:["F1"]});
  expect(roofOutlineAreaM2(next.workspace.roofOutline)).toBe(2);expect(next.workspace.spatialPreparation).toEqual(p.workspace.spatialPreparation);
  expect(next.estimate).toEqual(p.estimate);expect(JSON.stringify(p)).toBe(before);
});
it("explicit cleanup also removes imported orphan contour references without requiring a preparation or inventing supports",()=>{
  const p=m34abProject();p.workspace.roofOutline=outline();p.workspace.roofOutline.supportPieceIds=["F1","REMOVED"];
  delete p.workspace.spatialPreparation;const before=JSON.stringify(p),next=removeDeletedReferences(p);
  expect(next.workspace.roofOutline?.supportPieceIds).toEqual(["F1"]);expect(next.workspace.spatialPreparation).toBeUndefined();expect(JSON.stringify(p)).toBe(before);
});
