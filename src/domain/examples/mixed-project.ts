import { spatialAdapterExample } from "./spatial-adapter-example";
import { pieceRoles } from "../spatial-preparation";
import { generateStructure } from "../calculations/structure";

// Separate synthetic project only. Never apply these declarations to the active
// user's project. It uses actual JPN parametric geometry and explicit hypotheses.
export function mixedReferenceProject() {
  const p = spatialAdapterExample();
  p.id = "16161616-1616-4161-8161-161616161616";
  p.name = "EXEMPLO MISTO SINTÉTICO — 10 × 20 m";
  const d = p.workspace.spatialPreparation!;
  for (const role of pieceRoles) d.groups[role].elementKind = "frame";
  const model = generateStructure(p).model!, nodes = new Map(model.nodes.map(n => [n.id, n]));
  // A distinct, explicitly declared synthetic hypothesis: vertical webs are
  // rigid frames, inclined webs are axial. Never applied automatically to work.
  const diagonals = model.pieces.filter(piece => piece.role === "web" && Math.abs(nodes.get(piece.start)!.x - nodes.get(piece.end)!.x) > 1e-6);
  d.memberKinds = diagonals.map(piece => ({ pieceId: piece.id, kind: "axial" }));
  d.memberConnections = diagonals.map(piece => ({ pieceId: piece.id, start: "axial", end: "axial" }));
  d.connectionsReview = "Fixture mista: pilares, banzos, terças e montantes verticais são pórticos rígidos. Somente as diagonais inclinadas listadas por ID são barras axiais bilaterais sem momentos. Todas as juntas listadas conectam as translações, respeitando os tipos declarados. A hipótese alternativa de todos os montantes/diagonais axiais permanece instável e bloqueada.";
  d.lateralSystem = "Fixture: estabilidade pela ação dos pórticos rígidos, bases engastadas e barras axiais explicitamente presentes. Verificação numérica experimental, sem aprovação resistente.";
  d.loadPathReview = "Força nodal sintética na cumeeira: transferência por frames e axiais até os 12 engastes. Sem peso próprio ou vento presumido.";
  d.connectivity!.reviewSource = d.connectionsReview;
  d.cases.push({ id: "INVERSO", source: "Mesma carga sintética invertida para verificar linearidade; nenhuma combinação normativa" });
  d.loads.push({ ...d.loads[0], id: "33333333-3333-4333-8333-333333333333", caseId: "INVERSO", fxKn: -.2, fyKn: -.3, fzKn: 1 });
  d.combinations = [{ id: "TESTE-1", factors: { TESTE: 1, INVERSO: 0 } }, { id: "INVERSO-1", factors: { TESTE: 0, INVERSO: 1 } }];
  return p;
}
