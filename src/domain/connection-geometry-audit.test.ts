import { expect,it } from "vitest";
import { connectionSchema } from "./connections";
import { auditConnectionGeometry } from "./connection-geometry-audit";

function fixture(){const source="Synthetic exact geometry, no normative capacity";return connectionSchema.parse({id:"J",nodeId:"A",typology:"truss-joint",participants:[{pieceId:"P",behavior:"as-modeled"}],transferHypothesis:source,offsetGlobalM:[0,0,0],stiffness:null,source,revision:"1",responsible:source,components:[{id:"PL",kind:"plate",widthMm:100,heightMm:200,thicknessMm:5,material:"Declared synthetic material",source,revision:"1"}],transferGeometry:{schema_version:"jpn.connection-transfer-geometry/1",source,revision:"1",coordinateReference:"Origin lower-left, y across width, z along load",units:"mm",fixing:"bolted",holes:[{id:"H1",componentId:"PL",pieceId:"P",yMm:25,zMm:100,diameterMm:10,edgeYMm:25,edgeZMm:100},{id:"H2",componentId:"PL",pieceId:"P",yMm:75,zMm:100,diameterMm:10,edgeYMm:25,edgeZMm:100}],pitches:[{fromHole:"H1",toHole:"H2",distanceMm:50}],grossAreaMm2:500,netAreaMm2:400,netSectionPath:null,loadTransferPath:source,eccentricityMm:[0,0,0],rectangularPlate:{schema_version:"jpn.rectangular-plate/1",componentId:"PL",widthYMm:100,heightZMm:200,thicknessMm:5,originYMm:0,originZMm:0,coordinateResolutionMm:.001,areaResolutionMm2:.001,loadAxis:"z",netCutCoordinateMm:100}}});}
it("retângulo/furos: passo, bordos e seção transversal derivados, sem aprovar caminho governante",()=>{
  const a=auditConnectionGeometry(fixture());expect(a.status).toBe("geometry-consistent");expect(a.pitches[0].computedMm).toBe(50);expect(a.holes[0]).toEqual({id:"H1",nearestEdgeYMm:25,nearestEdgeZMm:100});
  expect(a.section!.grossAreaMm2).toBe(500);expect(a.section!.straightCutNetAreaMm2).toBe(400);expect(a.section!.governingNetSectionVerified).toBe(false);expect(a.resistanceVerified).toBe(false);
});
it.each(["pitch","edge","collision","outside","net","dimensions"])("recusa defeito geométrico comprovado: %s",kind=>{
  const f=fixture(),g=f.transferGeometry!;
  if(kind==="pitch")g.pitches[0].distanceMm=60;if(kind==="edge")g.holes[0].edgeYMm=30;if(kind==="collision")g.holes[1].yMm=28;if(kind==="outside")g.holes[0].yMm=2;if(kind==="net")g.netAreaMm2=499;if(kind==="dimensions")g.rectangularPlate!.thicknessMm=10;
  expect(auditConnectionGeometry(f).status).toBe("invalid-geometry");
});
it("não aceita área digitada sem chapa/corte e não usa texto ou trajetória escalonada como resistência",()=>{
  const f=fixture();delete f.transferGeometry!.rectangularPlate;expect(auditConnectionGeometry(f).status).toBe("pending-data");expect(auditConnectionGeometry(f).section).toBeNull();
  const g=fixture();g.transferGeometry!.rectangularPlate!.netCutCoordinateMm=102;expect(auditConnectionGeometry(g).issues.some(x=>x.code==="NET_CUT_UNSUPPORTED")).toBe(true);expect(auditConnectionGeometry(g).section).toBeNull();
});
