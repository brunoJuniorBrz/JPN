import { describe, expect, it } from "vitest";
import { createQuickProject } from "../quick-project";
import { roles } from "../structure";
import { generateStructure } from "./structure";
import { structureSignature } from "./project-basis";
import { buildPreproductionDossier } from "./preproduction";

const project = () => createQuickProject({typology:"gable",widthM:8,lengthM:12,heightM:4,slopePercent:15});
function declaredProject() {
  const p=project();
  p.technicalNotes="Dados de teste sintéticos, sem validade de engenharia.";
  for(const role of roles){
    const spec=p.planning!.profiles[role];
    spec.name=`PERFIL-DECLARADO-${role}`;
    spec.steelGrade="ACO-ENSAIO";
    spec.source="Fonte sintética R1 para testes";
    spec.stockLengthM=20;
    spec.massKgM=5;
  }
  const model=generateStructure(p).model!;
  p.workspace.fabrication=model.pieces.map(piece=>({
    pieceId:piece.id,
    signature:structureSignature(p),
    lengthMm:piece.lengthMm,
    note:"Comprimento de ensaio declarado; não liberado.",
  }));
  p.workspace.cutting={useFabrication:true,kerfMm:3,endTrimMm:2,minimumRemnantMm:100};
  return p;
}
describe("M25: dossiê preliminar para planejamento de materiais",()=>{
  it("não inventa preços, aço, comprimentos comerciais ou aprovação a partir do projeto visual",()=>{
    const p=project(), before=JSON.stringify(p),r=buildPreproductionDossier(p);
    expect(r.status).toBe("preliminary-not-released");
    expect(r.approvedForFabrication).toBe(false);
    expect(r.totals.pieces).toBeGreaterThan(0);
    expect(r.issues.some(i=>i.code==="VISUAL_ONLY")).toBe(true);
    expect(r.issues.some(i=>i.code==="STEEL_MISSING")).toBe(true);
    expect(r.issues.some(i=>i.code==="FINAL_LENGTH_MISSING")).toBe(true);
    expect(r.issues.some(i=>i.code==="CUTTING_PENDING")).toBe(true);
    expect(r.cutting).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
  });
  it("reconcilia peças, grupos, massa e cortes usando a mesma geometria 3D, sem aprovar",()=>{
    const p=declaredProject(),m=generateStructure(p).model!,before=JSON.stringify(p);
    const r=buildPreproductionDossier(p);
    expect(r.geometrySignature).toBe(structureSignature(p));
    expect(r.totals.pieces).toBe(m.pieces.length);
    expect(r.totals.geometricLengthMm).toBeCloseTo(m.pieces.reduce((s,x)=>s+x.lengthMm,0),5);
    expect(r.groups.reduce((s,g)=>s+g.quantity,0)).toBe(m.pieces.length);
    expect(r.groups.flatMap(g=>g.ids).sort()).toEqual(m.pieces.map(p=>p.id).sort());
    expect(r.groups.every(g=>g.finalDeclaredTotalMm!==null)).toBe(true);
    expect(r.totals.fullyDeclaredFinalLengths).toBe(true);
    expect(r.totals.completeMass).toBe(true);
    expect(r.totals.knownMassKg).toBeCloseTo(m.totalLengthM*5,6);
    expect(r.cutting).not.toBeNull();
    expect(r.cutting?.status).toBe("simulation_only");
    expect(r.totals.simulatedStockBars).toBeGreaterThan(0);
    expect(r.issues.some(i=>i.code==="DESIGN_UNVERIFIED")).toBe(true);
    expect(r.issues.some(i=>i.code==="CONNECTIONS_PENDING")).toBe(true);
    expect(r.approvedForFabrication).toBe(false);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("invalida todas as medidas finais cadastradas na revisão geométrica anterior",()=>{
    const p=declaredProject(); const original=buildPreproductionDossier(p);
    expect(original.totals.fullyDeclaredFinalLengths).toBe(true);
    p.roof.widthM=9;
    const r=buildPreproductionDossier(p);
    expect(r.totals.fullyDeclaredFinalLengths).toBe(false);
    expect(r.pieces.every(piece=>piece.finalDeclaredLengthMm===null)).toBe(true);
    expect(r.issues.some(i=>i.code==="FINAL_LENGTH_STALE")).toBe(true);
    expect(r.cutting).toBeNull();
    expect(r.issues.some(i=>i.code==="CUTTING_PENDING")).toBe(true);
  });
  it("detecta registros duplicados ou órfãos, sem permitir que se tornem comprimentos finais",()=>{
    const p=declaredProject();
    const duplicated={...p.workspace.fabrication[0],lengthMm:1};
    p.workspace.fabrication.push(duplicated,{pieceId:"PECA-REMOVIDA",signature:structureSignature(p),lengthMm:1000,note:"órfã"});
    const r=buildPreproductionDossier(p);
    expect(r.issues.some(i=>i.code==="FABRICATION_DUPLICATE")).toBe(true);
    expect(r.issues.some(i=>i.code==="FABRICATION_ORPHAN")).toBe(true);
    expect(r.approvedForFabrication).toBe(false);
  });
  it("não contabiliza como massa completa um perfil com massa linear desconhecida",()=>{
    const p=declaredProject();
    p.planning!.profiles.purlin.massKgM=null;
    const r=buildPreproductionDossier(p);
    expect(r.totals.completeMass).toBe(false);
    expect(r.issues.some(i=>i.code==="MASS_MISSING")).toBe(true);
    expect(r.groups.some(g=>g.role==="purlin" && g.massKg===null)).toBe(true);
  });
});
