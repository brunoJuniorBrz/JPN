import type { Node3D } from "@/domain/structure";

/** Local viewer state only. The next pick after a completed pair begins a new measurement. */
export function nextMeasurementNode(selection: readonly string[], nodeId: string): string[] {
  if (!nodeId) return [...selection];
  if (selection.length !== 1) return [nodeId];
  return selection[0] === nodeId ? [nodeId] : [selection[0], nodeId];
}

/** StructureModel coordinates are in millimetres. Do not round input or mutate the source nodes. */
export function calculateNodeMeasurement(nodes: readonly Node3D[], selected: readonly string[]) {
  if (selected.length !== 2 || selected[0] === selected[1]) return null;
  const from = nodes.find(n => n.id === selected[0]), to = nodes.find(n => n.id === selected[1]);
  if (!from || !to) return null;
  const dxMm = to.x - from.x, dyMm = to.y - from.y, dzMm = to.z - from.z;
  const lengthMm = Math.hypot(dxMm, dyMm, dzMm);
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return null;
  return { from: from.id, to: to.id, dxMm, dyMm, dzMm, lengthMm };
}
