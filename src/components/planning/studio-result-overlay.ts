/** Contract for FUTURE structural result overlays in the Studio 3D.
 *
 * Nothing in this file computes, estimates or draws a result. It only states
 * what the viewer will accept, so that displacements, internal forces,
 * reactions or verification states can never be shown without provenance.
 * The existing `analysisColors` prop of Structure3D stays the only live path. */
export const resultOverlayKinds = ["displacement", "deformed-shape", "bending-moment", "shear", "axial", "reaction", "verification"] as const;
export type ResultOverlayKind = typeof resultOverlayKinds[number];
export interface ResultOverlayBinding {
  /** Hash of the exact solver input the values came from (jpn.mixed3d input_sha256). */
  inputSha256: string;
  /** Hash of the solver result document. */
  resultSha256: string;
  /** Combination the values belong to; one overlay never mixes combinations. */
  combinationId: string;
  solver: { name: string; version: string };
}
export interface PieceScalar { pieceId: string; value: number; }
export interface ResultOverlay {
  schema_version: "jpn.studio-result-overlay/1";
  kind: ResultOverlayKind; units: string; binding: ResultOverlayBinding;
  /** One value per ORIGINAL physical piece ID; missing pieces stay uncoloured. */
  pieces: PieceScalar[];
  /** Always false: an overlay is a picture of results, never an approval. */
  computedStructuralApproval: false; fabricationRelease: false;
}
export type OverlayIssue = { code: string; message: string };

/** Refuses anything that is not fully traced to the model being displayed.
 * Returns issues; an empty list means the overlay MAY be drawn. */
export function reviewResultOverlay(overlay: ResultOverlay, model: { pieces: readonly { id: string }[] }, expectedInputSha256: string): OverlayIssue[] {
  const issues: OverlayIssue[] = [], add = (code: string, message: string) => issues.push({ code, message });
  const hash = /^[a-f0-9]{64}$/;
  if (overlay.schema_version !== "jpn.studio-result-overlay/1") add("OVERLAY_CONTRACT", "Contrato de sobreposição desconhecido.");
  if (!resultOverlayKinds.includes(overlay.kind)) add("OVERLAY_KIND", "Tipo de resultado não previsto.");
  if (!hash.test(overlay.binding.inputSha256) || !hash.test(overlay.binding.resultSha256)) add("OVERLAY_UNBOUND", "Resultado sem vínculo de hash com a entrada e a resposta do motor.");
  else if (overlay.binding.inputSha256 !== expectedInputSha256) add("OVERLAY_STALE", "Resultado calculado para outra revisão do modelo.");
  if (!overlay.binding.combinationId.trim() || !overlay.binding.solver.name.trim() || !overlay.binding.solver.version.trim()) add("OVERLAY_PROVENANCE", "Combinação e motor de origem são obrigatórios.");
  if (!overlay.units.trim()) add("OVERLAY_UNITS", "Unidade obrigatória.");
  if (overlay.computedStructuralApproval !== false || overlay.fabricationRelease !== false) add("OVERLAY_APPROVAL", "Sobreposição visual não pode declarar aprovação ou liberação.");
  const known = new Set(model.pieces.map(p => p.id)), seen = new Set<string>();
  for (const row of overlay.pieces) {
    if (!known.has(row.pieceId)) add("OVERLAY_ORPHAN_PIECE", `${row.pieceId}: peça inexistente no modelo exibido.`);
    if (seen.has(row.pieceId)) add("OVERLAY_DUPLICATE_PIECE", `${row.pieceId}: valor repetido.`);
    if (!Number.isFinite(row.value)) add("OVERLAY_NONFINITE", `${row.pieceId}: valor não finito.`);
    seen.add(row.pieceId);
  }
  return issues;
}
