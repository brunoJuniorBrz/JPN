/** NBR14762:2010 10.1(a). This is a separate connection design minimum,
 * never an invented load to be injected into the global equilibrium model. */
export function axialConnectionMinimum(solverAxialN:number|null,resistanceN:number|null,resistanceStatus:"PASS"|"FAIL"|"CONDITIONAL"|"BLOCKED"){
  if(solverAxialN!==null&&!Number.isFinite(solverAxialN)||resistanceN!==null&&(!Number.isFinite(resistanceN)||resistanceN<=0))throw Error("CONNECTION_MINIMUM_INPUT: esforço/resistência finitos e resistência positiva necessários.");
  if(solverAxialN===null||resistanceN===null||resistanceStatus==="BLOCKED")return {status:"BLOCKED" as const,solverAxialN,designMinimumMagnitudeN:null,reason:"A resistência da barra pertinente ao tipo de solicitação precisa estar disponível; não basta dimensionar a ligação só pela força da análise linear.",clause:"10.1(a)"};
  return {status:"CALCULATED-CONDITIONAL" as const,solverAxialN,memberResistanceN:resistanceN,memberResistanceStatus:resistanceStatus,
    halfMemberResistanceN:.5*resistanceN,designMinimumMagnitudeN:Math.max(Math.abs(solverAxialN),.5*resistanceN),clause:"10.1(a)",
    jointResistanceVerified:false as const,globalLoadsModified:false as const,
    reason:"Mínimo individual para o participante axial, condicionado à validade da resistência da barra e à cobertura ULS/estabilidade. Não soma envelopes incompatíveis nem verifica a junta inteira."};
}
