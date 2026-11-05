/** Explicit benchmark, excluded from the normal test suite. No design approval. */
import { expect,it,vi } from "vitest";
import { writeFileSync } from "node:fs";
import { windReferenceProject } from "@/domain/examples/wind-project";
import { adaptLoadedMixedProject } from "@/domain/loaded-mixed-adapter";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { buildResistanceReport } from "@/domain/resistance-report";
it("measures adapter, protected Python and whole-piece report on the actual generated synthetic roof",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  try{
    const before=process.memoryUsage(),start=performance.now(),project=windReferenceProject(),prepared=await adaptLoadedMixedProject(project),adapted=performance.now();
    const out=await runLocalMixed(JSON.stringify(prepared.request),"connections"),solved=performance.now();if(out.status!=="completed")throw Error("Worker did not complete");
    const report=await buildResistanceReport(project,prepared,out.result,out.joint_actions),finished=performance.now(),after=process.memoryUsage();
    expect(report.pieces).toHaveLength(207);expect(prepared.request.nodes).toHaveLength(132);expect(prepared.request.members).toHaveLength(243);expect(report.releaseGate.status).toBe("NOT_READY_BLOCKED");
    writeFileSync("docs/validation/engine-release/integrated-benchmark.json",JSON.stringify({kind:"synthetic-first-order-not-design",node:process.version,originalPieces:207,nodes:132,segments:243,combinations:prepared.request.combinations.length,elapsedMs:{adapt:adapted-start,protectedWorker:solved-adapted,continuousAndWholePieceReport:finished-solved,total:finished-start},memory:{before,after,note:"Node snapshots only, not a certified peak. Python peak RSS monitored separately."},bytes:{request:Buffer.byteLength(JSON.stringify(prepared.request)),workerEnvelope:Buffer.byteLength(JSON.stringify(out)),resistanceReport:Buffer.byteLength(JSON.stringify(report))},wholePieceRows:report.wholePieceDeflections?.pieces.reduce((n,p)=>n+p.combinations.reduce((n,c)=>n+c.rows.length,0),0),inputSha256:prepared.input_sha256,reportSha256:report.reportSha256,gate:report.releaseGate.status},null,2)+"\n");
  }finally{vi.unstubAllEnvs();}
});
