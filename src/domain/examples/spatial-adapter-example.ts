import { createQuickProject } from "../quick-project";
import { generateStructure } from "../calculations/structure";
import { structureSignature } from "../calculations/project-basis";
import { baseNodeIds, newSpatialPreparation, pieceRoles } from "../spatial-preparation";
import { inspectConnectivity } from "../spatial-connectivity";

// Synthetic verification fixture ONLY. Never apply these hypotheses to an
// existing user's project. All members are explicitly continuous rigid frames,
// including the visual diagonals; this is not a pin-jointed roof truss design.
export function spatialAdapterExample() {
  const project = createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4 });
  project.id = "11111111-1111-4111-8111-111111111111";
  project.name = "EXEMPLO SINTÉTICO — cobertura espacial rígida 10 × 20 m";
  const model = generateStructure(project).model!, draft = newSpatialPreparation(project);
  for (const role of pieceRoles) draft.groups[role] = {
    steelGrade: "Material isótropo sintético de verificação", materialSource: "Fixture matemática; E=200 GPa, nu=0,3, G=E/(2(1+nu))", materialRevision: "1",
    eGpa: 200, gGpa: 200 / 2.6, nu: .3, areaCm2: 100, iyCm4: 8000, izCm4: 8000, jCm4: 16000,
    sectionSource: "Seção sintética: A=0,01 m²; Iy=Iz=8e-5 m4; J=1,6e-4 m4; não é perfil comercial aprovado", sectionRevision: "1",
    rotationDeg: 0, connection: "rigid",
  };
  draft.supports = baseNodeIds(model).map(nodeId => ({ nodeId, dofs: ["fixed", "fixed", "fixed", "fixed", "fixed", "fixed"] }));
  const loadedNode = model.nodes.reduce((a, b) => b.z > a.z ? b : a);
  draft.cases = [{ id: "TESTE", source: "Carga nodal sintética de verificação: (0,2; 0,3; -1) kN; sem peso próprio automático" }];
  draft.loads = [{ id: "22222222-2222-4222-8222-222222222222", caseId: "TESTE", nodeId: loadedNode.id,
    fxKn: .2, fyKn: .3, fzKn: -1, mxKnm: 0, myKnm: 0, mzKnm: 0 }];
  draft.combinations = [{ id: "TESTE-1", factors: { TESTE: 1 } }];
  draft.connectionsReview = "Fixture: todas as interseções listadas compartilham os seis graus do nó. Todas as peças são pórticos rígidos contínuos; sem excentricidades ou rótulas.";
  draft.lateralSystem = "Fixture de pórticos espaciais rígidos com todas as bases engastadas. Estabilidade verificada numericamente; sem contraventamentos presumidos.";
  draft.loadPathReview = "Carga apenas no nó de cumeeira declarado; transmissão por pórticos rígidos até as bases. Não representa ações de projeto ou dimensionamento.";
  draft.connectivity = { version: 1, geometrySignature: structureSignature(project), reviewSource: draft.connectionsReview,
    junctions: inspectConnectivity(model).junctions.map(j => ({ nodeId: j.nodeId, pieceIds: j.pieceIds, decision: "connect" })) };
  project.workspace.spatialPreparation = draft;
  return project;
}
