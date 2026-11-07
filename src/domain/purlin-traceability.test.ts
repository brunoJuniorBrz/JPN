import { describe,expect,it } from "vitest";
import {purlinRequestSchema,purlinResultSchema,verifyPurlinResult} from "./purlin";

const candidate={
  id:"U75",family:"U" as const,height_mm:75,width_mm:40,thickness_mm:2.65,lip_mm:0,
  price_brl_per_m:30,source:"Dimensões fornecidas pelo fabricante",
};
const request=purlinRequestSchema.parse({
  schema_version:"jpn.purlin/1",request_id:"TEST-ORIGIN-0001",
  span_count:1,span_length_m:4,end_condition:"simple",uniform_load_n_m:0,
  load_mode:"surface",surface_pressure_n_m2:-800,tributary_width_m:1.25,
  load_source:"Memorial de carga vertical declarada",
  include_self_weight:true,gravity_m_s2:9.80665,
  e_gpa:200,density_kg_m3:7850,deflection_limit_ratio:250,
  candidates:[candidate],
});
function fixture(){
  const area=396.705;const mass=area*1e-6*7850*4;
  const selfweight=-area*1e-6*7850*9.80665;
  const q=-1000+selfweight;
  return purlinResultSchema.parse({
    schema_version:"jpn.purlin-result/1",request_id:request.request_id,
    analysis_scope:"elastic-strong-axis-bending-only-not-design-approval",
    input:{
      span_count:1,span_length_m:4,end_condition:"simple",
      uniform_load_n_m:0,load_mode:"surface",
      surface_pressure_n_m2:-800,tributary_width_m:1.25,
      load_source:request.load_source,include_self_weight:true,gravity_m_s2:9.80665,
      e_gpa:200,density_kg_m3:7850,deflection_limit_ratio:250,
    },
    results:[{
      id:candidate.id,family:"U",source:candidate.source,
      section_model:"sharp-corner-linear-elastic-approximation",
      area_mm2:area,inertia_mm4:123456,mass_kg:mass,estimated_material_cost_brl:120,
      declared_line_load_n_m:-1000,self_weight_line_load_n_m:selfweight,total_line_load_n_m:q,
      deflection_mm:-5,deflection_at_m:2,deflection_limit_mm:16,
      within_user_deflection_limit:true,peak_moment_nm:-q*4*4/8,moment_at_m:2,
      peak_shear_n:-q*4/2,shear_at_m:0,
      reactions:[{at_m:0,vertical_n:-q*2,moment_nm:0},{at_m:4,vertical_n:-q*2,moment_nm:0}],
      span_end_moments_nm:[[0,0]],
    }],
    computedStructuralApproval:false,fabricationRelease:false,
    limitations:["Não é dimensionamento resistente"],
  });
}
describe("contrato defensivo do resultado de terças",()=>{
  it("confere composição da carga, peso por perfil, massa, custo, flecha e equilíbrio",()=>{
    expect(()=>verifyPurlinResult(request,fixture())).not.toThrow();
  });
  const cases=[
    ["pressão adulterada",(r:ReturnType<typeof fixture>)=>{r.input.surface_pressure_n_m2=-900;}],
    ["faixa alterada",(r:ReturnType<typeof fixture>)=>{r.input.tributary_width_m=1.4;}],
    ["carga total alterada",(r:ReturnType<typeof fixture>)=>{r.results[0].total_line_load_n_m-=1;}],
    ["peso próprio alterado",(r:ReturnType<typeof fixture>)=>{r.results[0].self_weight_line_load_n_m=0;}],
    ["massa alterada",(r:ReturnType<typeof fixture>)=>{r.results[0].mass_kg+=1;}],
    ["custo alterado",(r:ReturnType<typeof fixture>)=>{r.results[0].estimated_material_cost_brl=200;}],
    ["critério alterado",(r:ReturnType<typeof fixture>)=>{r.results[0].deflection_limit_mm=8;}],
    ["origem da seção alterada",(r:ReturnType<typeof fixture>)=>{r.results[0].source="Outra origem";}],
    ["apoio sem equilíbrio",(r:ReturnType<typeof fixture>)=>{r.results[0].reactions[0].vertical_n-=50;}],
    ["vão alterado",(r:ReturnType<typeof fixture>)=>{r.input.span_length_m=5;}],
  ] as const;
  for(const [name,tamper] of cases){
    it("rejeita "+name,()=>{
      const r=fixture();tamper(r);
      expect(()=>verifyPurlinResult(request,r)).toThrow();
    });
  }
});
