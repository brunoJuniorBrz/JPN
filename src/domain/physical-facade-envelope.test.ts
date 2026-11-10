import {describe,expect,it} from "vitest";
import {auditPhysicalFacadeEnvelope} from "./physical-facade-envelope";
type V=[number,number,number];
const source="Medição de pano vertical identificada na obra";
const revision="Revisão física datada e identificada";
const ring=(list:V[]):V[]=>[...list,[...list[0]] as V];
const east=(id:string,y0:number,y1:number,openings:V[][]=[])=>({
  id,kind:"wall",outward:"+X",enclosure:"cladded",
  outer:ring([[8000,y0,0],[8000,y1,0],[8000,y1,4000],[8000,y0,4000]]),
  openings,supportPieceIds:[],source,revision,
  enclosureSource:"Inspeção de fachada e situação de aberturas",
});
const opening=ring([[8000,1000,1000],[8000,1000,2000],[8000,3000,2000],[8000,3000,1000]]);
const declaration=(faces:object[])=>({
  schema_version:"jpn.physical-facades/1",units:"mm",source,revision,facades:faces,
});
describe("M41-P2: sobreposição das fachadas e lacunas de fechamento",()=>{
  it("aceita dois panos lado a lado na mesma face, sem contar parede duas vezes",()=>{
    const result=auditPhysicalFacadeEnvelope(declaration([east("E1",0,3000),east("E2",3000,6000)]));
    expect(result.totalVerticalAreaM2).toBeCloseTo(24,10);
    expect(result.globalOverlapReviewed).toBe(true);
    expect(result.globalEnclosureState).toBe("not-established");
    expect(result.windReady).toBe(false);
    expect(result.fabricationRelease).toBe(false);
  });
  it("recusa dupla contagem mesmo quando um pano contém todo o outro",()=>{
    expect(()=>auditPhysicalFacadeEnvelope(declaration([east("E1",0,6000),east("E2",1000,4000)])))
      .toThrow("FACADE_SHEET_OVERLAP");
  });
  it("subtrai a abertura e sinaliza que a situação de fechamento não está deduzida",()=>{
    const result=auditPhysicalFacadeEnvelope(declaration([east("EAST",0,6000,[opening])]));
    expect(result.declaredGrossVerticalAreaM2).toBeCloseTo(24,10);
    expect(result.totalVerticalAreaM2).toBeCloseTo(22,10);
    expect(result.declaredOpeningsAreaM2).toBeCloseTo(2,10);
    expect(result.facesRequiringExplicitEnclosureReview).toEqual(["EAST"]);
    expect(result.pressureScenarioStatus).toBe("requires-normative-review");
  });
  it("aceita fachada perpendicular que encontra outra na aresta, sem somar áreas coplanares",()=>{
    const north={...east("NORTH",0,6000),outward:"+Y",
      outer:ring([[8000,6000,0],[2000,6000,0],[2000,6000,3000],[8000,6000,3000]])};
    const d=declaration([east("EAST",0,6000),north]);
    const result=auditPhysicalFacadeEnvelope(d);
    expect(result.faces).toHaveLength(2);
    expect(result.totalVerticalAreaM2).toBeCloseTo(42,10);
  });
  it("não infere fechamento global nem para muitos panos separados de fachada",()=>{
    const facade=east("EAST",0,6000);
    const tooMany=Array.from({length:16},(_,i)=>({...facade,id:"F"+i,
      outer:ring([[8000,i*10000,0],[8000,i*10000+6000,0],[8000,i*10000+6000,4000],[8000,i*10000,4000]])}));
    expect(auditPhysicalFacadeEnvelope(declaration(tooMany)).globalEnclosureState).toBe("not-established");
    const excessive=Array.from({length:32},(_,i)=>({
      ...facade,id:"Z"+i,
      outer:ring([[8000,i*100000,0],[8000,i*100000+6000,0],[8000,i*100000+6000,4000],[8000,i*100000,4000]]),
    }));
    expect(auditPhysicalFacadeEnvelope(declaration(excessive)).globalOverlapReviewed).toBe(true);
  });
});
