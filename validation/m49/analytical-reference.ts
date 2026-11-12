/** Independent Euler-Bernoulli closed forms, SI. No application, meshing,
 * distribution or solver imports. Positive pressure acts downwards.
 * Geometry: purlins L=4 m at x=0,3,6; beams B=6 m at y=0,4.
 * Sheeting is simply supported between purlins; self weight is excluded.
 * Torsion/in-plane loads vanish by symmetry in this particular benchmark.
 */
export function garageClosedForm(pressureNPerM2:number,beamI=4e-5,purlinI=8e-6){
  const e=200e9,l=4,b=6;
  const edgeQ=pressureNPerM2*1.5,centerQ=pressureNPerM2*3;
  const beamPointLoad=centerQ*l/2;
  const beamMidspanM=-beamPointLoad*b**3/(48*e*beamI);
  const purlinRelativeMidspanM=-5*centerQ*l**4/(384*e*purlinI);
  return {pressureNPerM2,totalDownwardN:pressureNPerM2*24,
    edgeQ,centerQ,beamPointLoad,
    cornerReactionN:edgeQ*l/2+beamPointLoad/2,
    beamShearN:beamPointLoad/2,beamMomentNm:beamPointLoad*b/4,
    purlinShearN:centerQ*l/2,purlinMomentNm:centerQ*l**2/8,
    beamMidspanM,purlinRelativeMidspanM,
    purlinAbsoluteMidspanM:beamMidspanM+purlinRelativeMidspanM,
    edgeMidspanM:-5*edgeQ*l**4/(384*e*purlinI)};
}
