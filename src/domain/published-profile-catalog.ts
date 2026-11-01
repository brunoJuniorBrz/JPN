/**
 * Catálogo inicial de massas e dimensões NOMINAIS publicados.
 * Recorte factual de jpn_catalogo_perfis_2026-11-01.csv (consulta: 2026-11-01).
 * Não contém resistência, aço, E/G, A/I/J verificados, preços, estoque ou
 * comprimentos comerciais. Não é um catálogo de dimensionamento estrutural.
 *
 * Em perfis W, as dimensões foram transcritas de fonte diferente da massa.
 * A checagem geométrica é aproximada: despreza filetes/raios e tolerâncias.
 */
import { profileSchema, type ProfileSpec } from "./structure";
import type { VisualSection } from "./profile-section";

export type CatalogFamily = VisualSection["family"];
export type PublishedCatalogEntry = Readonly<{
  id: string;
  family: CatalogFamily;
  designation: string;
  heightMm: number;
  widthMm: number;
  thicknessMm: number;
  flangeThicknessMm: number | null;
  massKgM: number;
  massSourceUrl: string;
  dimensionSourceUrl: string;
  consultedAt: "2026-11-01";
  massBasis: "kg/m publicado" | "kg/barra de 6 m dividido por 6";
  approximateMassKgM: number;
  differencePercent: number;
  requiresReview: boolean;
}>;

const GERDAU_W = "https://mais.gerdau.com.br/produtos/perfil-estrutural";
const W_DIM = "https://dobraco.com.br/produtos/perfilwabasparalelasi/";
const GERDAU_L = "https://www2.gerdau.com.br/wp-content/uploads/2022/07/Tabela-de-Bitolas-Gerdau-2.pdf";
const TUPER = "https://tuper-prd.s3.sa-east-1.amazonaws.com/uploads/2021/08/Tabela-Tecnica-de-Produtos-Tuper-2024.pdf";
const DOBRACO_U = "https://dobraco.com.br/produtos/perfiluestruturalsimples/";
const GERDAU_U = "https://mais.gerdau.com.br/produtos/perfil-u-viga-u";
const DENSITY_CHECK_KG_M3 = 7850; // Apenas conferência geométrica; nunca alimenta o peso próprio do motor.

function approximateMass(family: CatalogFamily, h: number, w: number, t: number, tf: number | null) {
  const area = family === "i" ? 2 * w * tf! + (h - 2 * tf!) * t
    : family === "rectangular-tube" || family === "square-tube" ? h * w - (h - 2 * t) * (w - 2 * t)
    : family === "angle" ? (h + w - t) * t
    : h * t + 2 * (w - t) * (tf ?? t);
  return area * DENSITY_CHECK_KG_M3 / 1_000_000;
}
function entry(id: number, family: CatalogFamily, designation: string, h: number, w: number,
  t: number, tf: number | null, mass: number, massSourceUrl: string, dimensionSourceUrl = massSourceUrl,
  massBasis: PublishedCatalogEntry["massBasis"] = "kg/m publicado"): PublishedCatalogEntry {
  const approximateMassKgM = approximateMass(family, h, w, t, tf);
  const differencePercent = Math.abs(mass - approximateMassKgM) / approximateMassKgM * 100;
  if (![h, w, t, mass, approximateMassKgM].every(v => Number.isFinite(v) && v > 0)) throw new Error("Entrada de catálogo inválida.");
  return Object.freeze({
    id: "P" + String(id).padStart(3, "0"), family, designation,
    heightMm: h, widthMm: w, thicknessMm: t, flangeThicknessMm: tf, massKgM: mass,
    massSourceUrl, dimensionSourceUrl, consultedAt: "2026-11-01",
    massBasis, approximateMassKgM, differencePercent, requiresReview: differencePercent > 5,
  });
}
// Dimensões: altura, largura da mesa, espessura da alma, espessura da mesa, kg/m.
const wSections: readonly (readonly [string, number, number, number, number, number])[] = [
  ["W 150 x 13,0",148,100,4.3,4.9,13],["W 150 x 18,0",153,102,5.8,7.1,18],
  ["W 200 x 15,0",200,100,4.3,5.2,15],["W 200 x 19,3",203,102,5.8,6.5,19.3],
  ["W 200 x 22,5",206,102,6.2,8,22.5],["W 200 x 26,6",207,133,5.8,8.4,26.6],
  ["W 200 x 31,3",210,134,6.4,10.2,31.3],["W 250 x 17,9",251,101,4.8,5.3,17.9],
  ["W 250 x 22,3",254,102,5.8,6.9,22.3],["W 250 x 25,3",257,102,6.1,8.4,25.3],
  ["W 250 x 28,4",260,102,6.4,10,28.4],["W 250 x 32,7",258,146,6.1,9.1,32.7],
  ["W 250 x 38,5",262,147,6.6,11.2,38.5],["W 250 x 44,8",266,148,7.6,13,44.8],
  ["W 310 x 21,0",303,101,5.1,5.7,21],["W 310 x 23,8",305,101,5.6,6.7,23.8],
  ["W 310 x 28,3",309,102,6,8.9,28.3],["W 310 x 32,7",313,102,6.6,10.8,32.7],
  ["W 310 x 38,7",310,165,5.8,9.7,38.7],
];
// Tubos Tuper: kg/m NORMALIZADO a partir do peso teórico de 6 metros.
const rectTubes: readonly (readonly [number, number])[] = [
  [3.75,14.920833],[4.25,16.857833],[4.75,18.782667],[5.60,22.026333],[6.30,24.670833],
];
const squareTubes: readonly (readonly [number, number])[] = [
  [3,9.076833],[3.75,11.238667],[4.25,12.656167],[4.75,14.0545],
];
// Aba externa A, espessura nominal e massa publicada.
const angles: readonly (readonly [number, number, number])[] = [
  [40,3,1.87],[40,4,2.42],[40,5,3],[45,4,2.77],[45,5,3.38],
  [50,4,3.09],[50,5,3.77],[60,4,3.64],[60,5,4.57],
  [65,5,4.98],[75,5,5.71],[75,6,6.87],[80,5,6.08],
];
// U formado a frio SIMPLES (não U enrijecido): h, aba, t, kg/m.
const coldU: readonly (readonly [number, number, number, number])[] = [
  [100,40,2,2.57],[100,40,2.65,3.54],[100,40,3,4.01],
  [127,50,2.65,4.52],[150,50,2,3.61],[150,50,2.65,5],
  [150,50,3,5.68],[150,50,4.75,8.64],[200,50,3,6.87],
];
// U laminado: designação, h, largura da aba, espessura da alma, da mesa, kg/m.
const rolledU: readonly (readonly [string, number, number, number, number, number])[] = [
  ["U 3 pol — 6,10 kg/m",76.2,35.81,4.32,6.93,6.1],
  ["U 3 pol — 7,44 kg/m",76.2,35.05,6.55,6.93,7.44],
  ["U 4 pol — 8,04 kg/m",101.6,40.23,4.67,7.52,8.04],
  ["U 4 pol — 9,30 kg/m",101.6,41.83,6.27,7.52,9.30],
  ["U 6 pol — 12,20 kg/m",152.4,48.77,5.08,8.71,12.20],
  ["U 8 pol — 17,10 kg/m",203.2,57.4,5.59,9.5,17.10],
];

export const PUBLISHED_PROFILE_CATALOG: readonly PublishedCatalogEntry[] = Object.freeze([
  ...wSections.map(([name,h,w,tw,tf,m],i) => entry(6+i,"i",name,h,w,tw,tf,m,GERDAU_W,W_DIM)),
  ...rectTubes.map(([t,m],i) => entry(25+i,"rectangular-tube","160 × 100 × " + t.toFixed(2) + " mm",160,100,t,null,m,TUPER,TUPER,"kg/barra de 6 m dividido por 6")),
  ...squareTubes.map(([t,m],i) => entry(30+i,"square-tube","100 × 100 × " + t.toFixed(2) + " mm",100,100,t,null,m,TUPER,TUPER,"kg/barra de 6 m dividido por 6")),
  ...angles.map(([leg,t,m],i) => entry(34+i,"angle","L " + leg + " × " + leg + " × " + t + " mm",leg,leg,t,null,m,GERDAU_L)),
  ...coldU.map(([h,w,t,m],i) => entry(47+i,"channel","U simples " + h + " × " + w + " × " + t.toFixed(2) + " mm",h,w,t,null,m,DOBRACO_U)),
  ...rolledU.map(([name,h,w,t,tf,m],i) => entry(56+i,"channel",name,h,w,t,tf,m,GERDAU_U)),
]);

export function catalogEntryById(id: string): PublishedCatalogEntry | undefined {
  return PUBLISHED_PROFILE_CATALOG.find(p => p.id === id);
}
export function planningProfileFromCatalog(p: PublishedCatalogEntry): ProfileSpec {
  let visualSection: VisualSection;
  if (p.family === "i") visualSection = { family:"i",heightMm:p.heightMm,flangeWidthMm:p.widthMm,webThicknessMm:p.thicknessMm,flangeThicknessMm:p.flangeThicknessMm,rollDeg:0 };
  else if (p.family === "square-tube") visualSection = { family:"square-tube",sideMm:p.heightMm,rollDeg:0 };
  else if (p.family === "rectangular-tube") visualSection = { family:"rectangular-tube",heightMm:p.heightMm,widthMm:p.widthMm,rollDeg:0 };
  else if (p.family === "angle") visualSection = { family:"angle",legXmm:p.heightMm,legYmm:p.widthMm,rollDeg:0 };
  else visualSection = { family:"channel",heightMm:p.heightMm,flangeWidthMm:p.widthMm,opening:"positive-x",rollDeg:0 };
  return profileSchema.parse({
    name:p.designation,
    steelGrade:"", // Nunca presumir fy/fu ou um tipo de aço pela designação.
    section:"Dimensões nominais: h=" + p.heightMm + " mm, b=" + p.widthMm + " mm, t=" + p.thicknessMm + " mm" + (p.flangeThicknessMm ? ", tf=" + p.flangeThicknessMm + " mm" : ""),
    source:"Massa: " + p.massSourceUrl + " | Dimensões: " + p.dimensionSourceUrl + " | consulta " + p.consultedAt + (p.requiresReview ? " | ALERTA divergência geométrica >5%" : ""),
    massKgM:p.massKgM,
    stockLengthM:null, // Barras de 6m usadas como BASE DE MASSA não comprovam estoque de 6m.
    pricePerMeterCents:null,
    data:{
      kind:p.family==="i"?"i":p.family.endsWith("tube")?"tube":p.family==="angle"?"angle":"channel",
      dimensions:p.designation,thicknessMm:p.family==="i"?null:p.thicknessMm,
      areaCm2:null,elasticModulusGpa:null,iyCm4:null,izCm4:null,
      origin:"declared",sourceDate:p.consultedAt,calculationReference:"",
    },
    visualSection,
  });
}
