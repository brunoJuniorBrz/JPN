import { planningExample } from "./planning-example";
import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { roles, sectionDataSchema, type ProfileSpec } from "./structure";

// A separate visual demonstration. Never merges dimensions into a user's
// project or claims that a commercial profile was selected by engineering.
export function profiles3DDemo(source: Project = planningExample()) {
  // Demonstrate profile geometry on the CURRENT project's spans and roof shape,
  // without inserting synthetic sections or costs into the saved project.
  const project = structuredClone(source);
  if (!project.planning) throw new Error("A demonstração 3D exige geometria previamente configurada.");
  const sections: Record<typeof roles[number], ProfileSpec["visualSection"]> = {
    column: { family: "i", heightMm: 240, flangeWidthMm: 160, webThicknessMm: 8, flangeThicknessMm: 12, rollDeg: 0 },
    topChord: { family: "rectangular-tube", widthMm: 100, heightMm: 160, rollDeg: 0 },
    bottomChord: { family: "square-tube", sideMm: 100, rollDeg: 0 },
    web: { family: "angle", legXmm: 70, legYmm: 70, rollDeg: 0 },
    purlin: { family: "channel", heightMm: 160, flangeWidthMm: 60, opening: "positive-x", rollDeg: 0 },
  };
  for (const role of roles) project.planning!.profiles[role] = {
    name: `DEMONSTRAÇÃO — ${role === "column" ? "I 240 × 160" : role === "topChord" ? "Tubo 100 × 160" : role === "bottomChord" ? "Tubo 100 × 100" : role === "web" ? "L 70 × 70" : "U 160 × 60"}`,
    steelGrade: "Não especificado", section: "Dimensões sintéticas para visualizar a seção",
    source: "Demonstração geométrica JPN; sem catálogo comercial ou propriedades resistentes", massKgM: null, stockLengthM: null,
    data: { ...sectionDataSchema.parse({}), thicknessMm: role === "column" ? null : 5 }, visualSection: sections[role],
  };
  return generateStructure(project).model!;
}
