import { mixedReferenceProject } from "./mixed-project";
import { structureSignature } from "../calculations/project-basis";

/** Separate synthetic control, never imported into a user's physical groups. */
export function roofAreaReferenceProject(){
  const p=mixedReferenceProject(),d=p.workspace.spatialPreparation!;
  p.name="EXEMPLO SINTÉTICO — AÇÃO POR ÁREA";
  d.cases=[{id:"AREA",source:"Ensaio sintético uniforme de 0,1 kN/m² em projeção horizontal; não normativo"}];
  d.loads=[];
  d.combinations=[{id:"AREA",factors:{AREA:1}},{id:"INVERSA",factors:{AREA:-1}}];
  d.loadPathReview="Ensaio explícito: superfície para faixas das terças, terças pórtico para encontros conectados, estrutura até bases engastadas. Nenhum peso próprio ou vento automático.";
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[{caseId:"AREA",knM2:.1,projection:"horizontal",direction:[0,0,-1],source:"Ação sintética de ensaio, sem equivalência normativa ou obra real",revision:"M21-R1",loadPath:d.loadPathReview}],
    roofDistribution:{version:1,method:"parallel-purlin-strips",geometrySignature:structureSignature(p)}};
  return p;
}
