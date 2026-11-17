import reconstruction from "../../validation/tom-2026/tom-jpn-reconstruction.json" with { type: "json" };
import source from "../../validation/tom-2026/tom-commercial-source.json" with { type: "json" };
import { packBars } from "./calculations/cutting";

/**
 * Quantitativo próprio do JPN para a obra de referência do Tom, comparado com o
 * orçamento do Alan. Estimativa comercial: não dimensiona peças, não libera
 * fabricação e não substitui revisão profissional.
 */
type Reconstruction = typeof reconstruction;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eps = 1e-9;

export function sheetTakeoff(r: Reconstruction = reconstruction) {
  const a = r.assumptions, factor = Math.sqrt(1 + (a.slope_percent / 100) ** 2);
  const faces = r.faces.map(f => {
    const sheets = Math.ceil(f.width_m / a.sheet_useful_width_m - eps);
    const lengthM = Math.ceil((f.run_m * factor + a.sheet_gutter_projection_m) * 100 - eps) / 100;
    const purlinLines = Math.max(1, Math.ceil(f.run_m / a.purlin_spacing_m - 0.05)) + 1;
    const fasteners = sheets * purlinLines * a.fasteners_per_sheet_per_purlin;
    const stitches = (sheets - 1) * Math.ceil(lengthM / a.stitch_spacing_m);
    return { id: f.id, name: f.name, areaM2: f.run_m * f.width_m, sheets, lengthM, linearM: r2(sheets * lengthM), purlinLines, fasteners, stitches };
  });
  const sum = (k: "sheets" | "linearM" | "fasteners" | "stitches" | "areaM2") => faces.reduce((s, f) => s + f[k], 0);
  return { faces, areaM2: r2(sum("areaM2")), sheets: sum("sheets"), linearM: r2(sum("linearM")), fasteners: sum("fasteners") + sum("stitches") };
}

function bars(group: Reconstruction["purlin_pieces"] | Reconstruction["truss_pieces"], r: Reconstruction) {
  const a = r.assumptions;
  const pieces = group.pieces.flatMap(p => Array.from({ length: p.count }, (_, i) => ({ id: `${p.length_m.toFixed(2)}#${i + 1}`, lengthMm: Math.round(p.length_m * 1000) })));
  const plan = packBars({ stockMm: a.stock_length_m * 1000, kerfMm: a.kerf_mm, endTrimMm: a.end_trim_mm, minimumRemnantMm: a.minimum_remnant_mm, pieces });
  const netM = plan.totalPieceMm / 1000;
  return { profile: group.profile, netM: r2(netM), bars: plan.bars.length, utilizationPercent: r2(plan.utilizationPercent), netKg: r2(netM * group.kg_per_m), boughtKg: r2(plan.bars.length * a.stock_length_m * group.kg_per_m), plan };
}

export function tomJpnComparison(r: Reconstruction = reconstruction) {
  const p = r.prices_cents, sheets = sheetTakeoff(r), purlins = bars(r.purlin_pieces, r), trusses = bars(r.truss_pieces, r);
  const s = r.supports, anchors = s.count * s.anchors_per_support;
  const rods = Math.ceil(anchors * s.anchor_length_m / s.threaded_rod_stock_m - eps);
  const alanPurlins = source.metal_profiles[1].quantity_pieces, alanTrusses = source.metal_profiles[0].quantity_pieces;
  const alanSheetsM = source.roofing_sheet.total_linear_m, alanFasteners = source.roofing_fasteners.quantity;
  const rows = [
    { item: "Terças Ue 75x40 (barras 6 m)", alan: alanPurlins, jpn: purlins.bars, alanCents: alanPurlins * p.purlin_bar, jpnCents: purlins.bars * p.purlin_bar },
    { item: "Tesouras U 75x40 (barras 6 m)", alan: alanTrusses, jpn: trusses.bars, alanCents: alanTrusses * p.truss_bar, jpnCents: trusses.bars * p.truss_bar },
    { item: "Telha TR25 (m lineares)", alan: alanSheetsM, jpn: sheets.linearM, alanCents: Math.round(alanSheetsM * p.sheet_per_m), jpnCents: Math.round(sheets.linearM * p.sheet_per_m) },
    { item: "Parafusos autobrocantes", alan: alanFasteners, jpn: sheets.fasteners, alanCents: alanFasteners * p.fastener, jpnCents: sheets.fasteners * p.fastener },
    { item: "Fixação nas paredes (barra roscada, porca, arruela)", alan: 0, jpn: anchors, alanCents: 0, jpnCents: rods * p.threaded_rod_bar + anchors * (p.nut + p.washer) },
    { item: "Veda-calha (tubos)", alan: 0, jpn: r.flashing.sealant_tubes, alanCents: 0, jpnCents: r.flashing.sealant_tubes * p.sealant_tube },
  ];
  const flashingM = r.flashing.gutter_m + r.flashing.flashing_m;
  const flashing = { meters: flashingM, lowCents: Math.round(flashingM * p.flashing_per_m_low), highCents: Math.round(flashingM * p.flashing_per_m_high) };
  const alanMaterialCents = rows.reduce((t, x) => t + x.alanCents, 0), jpnMaterialCents = rows.reduce((t, x) => t + x.jpnCents, 0);
  return {
    status: "estimate_only" as const, structuralApproval: false as const, fabricationRelease: false as const,
    sheets, purlins, trusses, anchors, rods, rows, flashing,
    alanMaterialCents, jpnMaterialCents, alanConsumablesCents: source.reported_totals.consumables_cents,
    steelKgBought: r2(purlins.boughtKg + trusses.boughtKg), steelKgPerM2: r2((purlins.netKg + trusses.netKg) / sheets.areaM2),
  };
}
