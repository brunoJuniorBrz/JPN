// UFSC 2023 historical benchmark QA. Run: node validation/ufsc-2023/validate-reference.mjs
// This checks integrity and analytical consistency, not source PDF authenticity or FE equivalence.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const dir=dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(readFileSync(join(dir,name),"utf8"));
const src=read("source-model-actions.json"), m=read("published-member-results.json"),
  u=read("published-displacements.json"),a=read("audit-and-gaps.json");
const near=(actual,expected,absTolerance,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=absTolerance,
  label+": "+actual+" vs "+expected);
const count=(v,n,label)=>assert.equal(v.length,n,label);
assert.equal(src.case_id,"benvenuti-ufsc-2023");
assert.equal(m.case_id,src.case_id);assert.equal(u.case_id,src.case_id);assert.equal(a.case_id,src.case_id);
assert.equal(src.use_limits.structural_approval,false);
assert.equal(src.use_limits.fabrication_release,false);
assert.equal(src.use_limits.source_exact_FE_model,false);
near(src.geometry.width_m,40,0,"width in source p55");
near(src.geometry.length_m,80,0,"length in source p55");
near(src.geometry.frame_spacing_m,8,0,"spacing in source p55");
near(src.geometry.roof_pitch_deg,10,0,"pitch in source p55");
near(src.loads.permanent_kN_m2.total,.45,0,"G in source p59");
near(src.loads.frame_permanent_kN_m,3.6,0,"G frame in source p60");
near(src.loads.frame_live_kN_m,2,0,"Q frame in source p60");
near(src.loads.wind.V0_m_s,45,0,"wind V0 p57");
near(src.loads.wind.Vk_reported_m_s,38.39,0,"wind Vk p57");
count(src.combinations.ultimate,9,"p60 ULS combinations");
count(src.combinations.service,3,"p81 SLS combinations");
near(src.combinations.ultimate.find(x=>x.id==="F5").factors.G,1.25,0,"F5");
near(src.combinations.ultimate.find(x=>x.id==="F5").factors.Q,1.5,0,"F5");
count(m.columns.rows,3,"p64 pillar combos");
near(m.columns.rows.find(x=>x.combination==="F5").moment_Msd_kNm,539.238,0,"p64 column moment");
count(m.diagonals.rows,5,"p65 diagonals");
count(m.verticals.rows,6,"p65 verticals");
near(m.diagonals.rows[0].compression.demand_kN,190.975,0,"p65 diagonal 1 Nc");
near(m.diagonals.rows[0].tension.demand_kN,194.856,0,"p65 diagonal 1 Nt");
near(m.verticals.rows[5].compression.demand_kN,301.224,0,"p65 central montante Nc");
near(m.verticals.rows[5].tension.demand_kN,418.414,0,"p65 central montante Nt");
for(const r of [...m.diagonals.rows,...m.verticals.rows])
  for(const mode of ["compression","tension"]) {
    const x=r[mode];
    near(100*x.demand_kN/x.resistance_kN,x.utilization_percent,.4,"reported ratio "+r.group+" "+mode);
  }
near(m.purlin.displacement_printed_mm,4.3,0,"p131 purlin deflection");
near(m.purlin.used_inertia_cm4,3290,0,"p131 purlin inertia");
count(u.ULS_2D.entries,18,"p81 extrema");
count(u.SLS_2D.entries,6,"p82 extrema");
count(u.SLS_3D.entries,27,"p86 3D extrema");
near(u.SLS_2D.entries.find(x=>x.combination==="S1"&&x.axis==="source_vertical").linear_m,-.1323,0,"p82 S1 central displacement");
near(u.SLS_3D.entries.find(x=>x.combination==="S1"&&x.portal==="central"&&x.axis==="vertical").linear_m,-.1243,0,"p86 S1 central vertical");
const q=.5385+.5385+.6*Math.cos(10*Math.PI/180)*(-2.725);
const delta_mm=5*Math.abs(q)*1000*Math.pow(8,4)/(384*200e9*(3290e-8))*1000;
near(q,a.independent_arithmetic.purlin_SLS_computed_kN_m,1e-12,"purlin load derived");
near(delta_mm,a.independent_arithmetic.purlin_classical_flecha_384_mm,1e-9,"purlin deflection derived");
near(delta_mm,4.321464447213456,1e-6,"classical purlin benchmark");
near(a.independent_arithmetic.ridge_from_eave_m,11.53,.01,"ridge height derived");
count(a.source_discrepancies,10,"source discrepancies inventory");
count(a.missing_for_exact_model,11,"FE gaps inventory");
assert.equal(u.appendix_H.status,"NOT_FULLY_TRANSCRIBED");
console.log("UFSC 2023 reference integrity PASS: 4 JSON files; 9 ULS / 3 SLS; 3 columns; 5 diagonal groups; 6 vertical groups; 18 2D ULS / 6 2D SLS / 27 3D SLS extrema. Source FE inputs still missing.");
