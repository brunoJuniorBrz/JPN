import { planningExample } from "./planning-example";
import { sectionDataSchema } from "./structure";
import { structureSignature, transferTakeoff } from "./calculations/project-basis";
import { trussGeometry } from "./analysis";

export const PREPROJECT_EXAMPLE_ID = "278f6fa5-c5fa-440e-923d-527e0d880601";
export function preprojectExample() {
  let p = planningExample();
  p.id = PREPROJECT_EXAMPLE_ID; p.name = "EXEMPLO FICTÍCIO — Pré-projeto de duas águas";
  p.description = "Demonstração do pré-projeto e proposta. Quantitativos geométricos, preços e propriedades sintéticos; não utilizar para execução ou compra.";
  p.planning!.typology = "gable"; p.planning!.overhangStartM = .5;
  p.planning!.specificationNotes = "Demonstração sintética: duas águas simétricas, prolongamento longitudinal das terças de 0,50 m. Modelo experimental separado de uma tesoura articulada, com carga nodal de teste; sem ações normativas e sem liberação de fabricação.";
  for (const profile of Object.values(p.planning!.profiles)) {
    profile.pricePerMeterCents = 1000;
    profile.source = "EXEMPLO FICTÍCIO — propriedades de teste, sem catálogo comercial";
    profile.data = { ...sectionDataSchema.parse({}), areaCm2: 10, elasticModulusGpa: 200, sourceDate: "Dados sintéticos — 30/10/2026" };
  }
  p.workspace.cutting = { kerfMm: 3, endTrimMm: 10, minimumRemnantMm: 500, useFabrication: false };
  const nodes = trussGeometry(p).nodes;
  p.workspace.analysis = { signature: structureSignature(p), articulated: true,
    supports: [{ node: nodes.find(n => n.xMm === 0 && n.yMm === 3200)!.id, uxMm: 0, uyMm: 0 }, { node: nodes.find(n => n.xMm === 10000 && n.yMm === 3200)!.id, uxMm: null, uyMm: 0 }],
    loads: [{ node: nodes.find(n => n.xMm === 5000 && n.yMm === 4500)!.id, fxKn: 0, fyKn: -10 }] };
  p = transferTakeoff(p, 0);
  p.estimate.pricingPercent = 25;
  p.estimate.labor = [{ id: crypto.randomUUID(), description: "Fabricação fictícia para demonstração", quantity: 8, unit: "hora", unitPriceCents: 5000 }, { id: crypto.randomUUID(), description: "Instalação fictícia para demonstração", quantity: 8, unit: "hora", unitPriceCents: 5000 }];
  p.estimate.expenses = [{ id: crypto.randomUUID(), description: "Transporte fictício para demonstração", quantity: 1, unit: "viagem", unitPriceCents: 20000 }];
  p.estimate.paymentTerms = "Condições fictícias para demonstração; definir na proposta real.";
  p.estimate.validity = "Exemplo sem validade comercial.";
  p.estimate.deadline = "Prazo fictício, a definir na obra real.";
  p.estimate.exclusions = "Dimensionamento normativo, detalhamento executivo, ligações, fundações, contraventamentos e liberação de fabricação não estão incluídos.";
  return p;
}
