import { m34abProject,reviewM34Fixture } from "./m34ab-fixtures";
import { emptyLoading } from "../structural-loading";
/** Synthetic tests only. No member, property or load here describes the Tom roof. */
export function declaredUniformFixture(){
  const p=m34abProject(),d=p.workspace.spatialPreparation!;
  p.name="M35 — balanço misto sintético de referência";p.workspace.physicalStructure!.revision="M35-SYNTHETIC-1";
  p.workspace.physicalStructure!.provenance="Modelo didático independente; não representa a obra Tom";
  d.loads=[];d.loading=emptyLoading();
  d.loading.uniform=["F1","F2"].map(pieceId=>({id:"UDL-"+pieceId,pieceId,caseId:"Q",coordinates:"global",knM:[0,0,-.1],source:"Synthetic q=-100N/m, independent Euler-Bernoulli control",revision:"1"}));
  return reviewM34Fixture(p);
}
