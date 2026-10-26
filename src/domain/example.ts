import { defaultSettings, newProject, type Material, type Project, type Settings } from "./models";
export const EXAMPLE_ID = "d0955ca0-2e9e-4e2a-b457-300000000001";
export function exampleMaterials(): Material[] {
  const now = new Date().toISOString();
  return [
    { id: "d0955ca0-2e9e-4e2a-b457-300000000002", name: "Telha por m² — exemplo", code: "EX-01", category: "Telhas metálicas", purchaseUnit: "m²", measurementUnit: "m²", measurementPerPurchase: null, unitPriceCents: 8000, supplier: "Fornecedor fictício", notes: "Preço fictício para aprender a usar o sistema. Não é cotação de mercado.", updatedAt: now, isExample: true },
    { id: "d0955ca0-2e9e-4e2a-b457-300000000003", name: "Perfil por barra — exemplo", code: "EX-02", category: "Perfis metálicos", purchaseUnit: "barra", measurementUnit: "m", measurementPerPurchase: 6, unitPriceCents: 25000, supplier: "Fornecedor fictício", notes: "Barra de 6 m apenas como exemplo de compra. Perfil e resistência não dimensionados.", updatedAt: now, isExample: true },
    { id: "d0955ca0-2e9e-4e2a-b457-300000000004", name: "Fixador — exemplo", code: "EX-03", category: "Parafusos e fixadores", purchaseUnit: "un", measurementUnit: "un", measurementPerPurchase: null, unitPriceCents: 250, supplier: "Fornecedor fictício", notes: "Quantidade e preço fictícios; sem especificação de ligação.", updatedAt: now, isExample: true },
  ];
}
export function exampleProject(settings: Settings = defaultSettings): Project {
  const project = newProject(settings), materials = exampleMaterials();
  return { ...project, id: EXAMPLE_ID, name: "EXEMPLO — Cobertura da garagem", client: "Sr. Antônio — cliente fictício", location: "Obra fictícia para demonstração", description: "Cobertura de uma água, com 6 m de largura e 10 m de comprimento. Todos os materiais, preços e quantidades manuais são fictícios.", status: "Em elaboração", isExample: true,
    technicalNotes: "Exemplo de geometria e orçamento, sem dimensionamento estrutural. Apoios, perfis, ligações e quantidade de peças precisam de especificação profissional.",
    commercialNotes: "Valores fictícios para demonstração. Não usar como proposta comercial.",
    roof: { ...project.roof, widthM: 6, lengthM: 10, lowHeightM: 3, slopePercent: 10, revision: 1 },
    estimate: { ...project.estimate, pricingMode: "markup", pricingPercent: 25, deadline: "Prazo a combinar — exemplo", materials: materials.map((m, i) => ({ id: crypto.randomUUID(), materialId: m.id, name: m.name, purchaseUnit: m.purchaseUnit, measurementUnit: m.measurementUnit, measurementPerPurchase: m.measurementPerPurchase, unitPriceCents: m.unitPriceCents, wastePercent: i === 0 ? 5 : 0, source: i === 0 ? "roof-area" : "manual", manualQuantity: i === 1 ? 24 : i === 2 ? 100 : null })),
      labor: [{ id: crypto.randomUUID(), description: "Montagem — exemplo", quantity: 2, unit: "dia", unitPriceCents: 60000 }],
      expenses: [{ id: crypto.randomUUID(), description: "Transporte — exemplo", quantity: 1, unit: "viagem", unitPriceCents: 35000 }],
    },
  };
}
