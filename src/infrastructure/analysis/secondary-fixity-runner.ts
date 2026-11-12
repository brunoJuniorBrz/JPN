import type { Project } from "@/domain/models";
import { auditSecondaryFixity, executorFailureCodes, SecondaryFixityBlocked, type CounterfactualOutcome } from "@/domain/secondary-fixity";
import { runLocalMixed } from "./local-mixed-runner";
import { SolverFailure } from "./runner";

/** A refusal by the solver's own mechanism/conditioning/linear-domain gates is
 * the answer the audit is looking for; anything else is rethrown. */
export function counterfactualRefusal(e: unknown): CounterfactualOutcome {
  if (!(e instanceof SolverFailure) || executorFailureCodes.has(e.code)) throw e;
  return { completed: false, refusalCode: e.code };
}

type Prepared = Parameters<typeof auditSecondaryFixity>[1];
/** C2 inside the normal local flow: the same capped worker, tolerances and gates
 * analyse the counterfactual. A dependent structure is refused with the audit's
 * blocking code and no result of the declared model is published. */
export async function runLocalSecondaryFixityAudit(project: Project, prepared: Prepared, signal?: AbortSignal) {
  try {
    return await auditSecondaryFixity(project, prepared, async request => {
      try {
        const out = await runLocalMixed(JSON.stringify(request), "analysis", signal);
        if (out.status !== "completed") throw new SolverFailure("INVALID_RESPONSE", "Contrafactual sem resposta de análise.");
        return { completed: true };
      } catch (e) { return counterfactualRefusal(e); }
    });
  } catch (e) {
    if (e instanceof SecondaryFixityBlocked) throw new SolverFailure(e.code, e.message.slice(e.code.length + 2));
    throw e;
  }
}
