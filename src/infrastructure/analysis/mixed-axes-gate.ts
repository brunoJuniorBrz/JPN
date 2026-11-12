import { LocalAxesError, referenceBasis, refuseAmbiguousLegacyAxes, verifyLocalAxes, type V3 } from "@/domain/local-axes";
import type { AnyMixedRequest, AnyMixedResult } from "@/domain/structural-loading";
import type { JointActionTrace } from "@/domain/member-end-actions";
import { SolverFailure } from "./runner";

/** C1 gates shared by the local and remote mixed executors. They only refuse:
 * no request is rewritten and no response is repaired. */
const asFailure = (e: unknown): never => {
  if (e instanceof LocalAxesError) throw new SolverFailure(e.code, e.message.slice(e.code.length + 2));
  throw e;
};

/** Before transport. /1 and /2 keep their bytes and hashes but an ambiguous
 * physical orientation is never sent; /3 must be realisable for every member. */
export function gateRequestAxes(request: AnyMixedRequest) {
  try {
    if (request.schema_version !== "jpn.mixed3d/3") return refuseAmbiguousLegacyAxes(request);
    const nodes = new Map(request.nodes.map(n => [n.id, [n.x_m, n.y_m, n.z_m] as V3]));
    for (const m of request.members) if (m.kind === "frame") referenceBasis(nodes.get(m.start)!, nodes.get(m.end)!, m.id);
  } catch (e) { asFailure(e); }
}

/** After transport. The axes the solver reports are recomputed from the
 * request; the joint-action trace, when present, must carry the same basis. */
export function gateResultAxes(request: AnyMixedRequest, result: AnyMixedResult, trace?: JointActionTrace) {
  if (request.schema_version !== "jpn.mixed3d/3") return;
  if (result.schema_version !== "jpn.mixed3d-result/3") throw new SolverFailure("AXIS_REALISATION_FAILED", "Resposta sem os eixos locais do contrato jpn.mixed3d/3; nenhum resultado publicado.");
  try { verifyLocalAxes(request, result.local_axes); } catch (e) { asFailure(e); }
  if (trace) for (const [id, row] of Object.entries(result.local_axes.members)) {
    const traced = trace.members[id]?.global_to_local;
    if (!traced || traced.some((r, i) => r.some((v, j) => v !== row.global_to_local[i][j])))
      throw new SolverFailure("AXIS_REALISATION_FAILED", `${id}: base das ações de extremidade difere da base local declarada.`);
  }
}
