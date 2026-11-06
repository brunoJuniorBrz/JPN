import {expect,it} from "vitest";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {createTomDemonstration} from "@/domain/client-demonstration";
import {createCommercialDemoPdf,createTechnicalDemoPdf} from "./demonstration";

async function pdfText(bytes:ArrayBuffer){
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),doc=await task.promise;let text="";
  try{for(let i=1;i<=doc.numPages;i++)text+=(await(await doc.getPage(i)).getTextContent()).items.map(x=>"str"in x?x.str:"").join(" ");return text;}finally{await task.destroy();}
}
it("reopens the customer commercial summary independently and preserves the audited total and material rows",async()=>{
  const text=await pdfText(await createCommercialDemoPdf(createTomDemonstration()));
  expect(text).toContain("9.651,29");expect(text).toContain("107");expect(text).toContain("TR25");expect(text).toContain("Geometria real pendente");
});
it("exports all pending technical categories and the saved information without structural approval",async()=>{
  const p=createTomDemonstration();p.workspace.demonstration!.technicalData!.supports={information:"Levantamento a confirmar em campo",source:"Responsavel tecnico"};
  const text=await pdfText(await createTechnicalDemoPdf(p));
  expect(text).toContain("Levantamento a confirmar em campo");expect(text).toContain("Responsavel tecnico");expect(text).toContain("Pendente");expect(text).toContain("NOT_READY_BLOCKED");
});
