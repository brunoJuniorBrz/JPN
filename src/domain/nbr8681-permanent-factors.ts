import data from "../../data/normas/nbr8681-2025-combinations.json" with {type:"json"};

/** Reference permanent factors of NBR 8681:2025 from the single source (data/normas/nbr8681-2025-combinations.json),
 * by the declared classification of each permanent action: Tabela 1 (separate, by type), Tabela 2 (grouped),
 * Tabela 3 (prestress; settlement and shrinkage). Dependency-free on purpose (no project/domain imports), so the
 * generator and the anchor pull-out check share it without import cycles. */
export type Nbr8681UlsKind="normal"|"special"|"exceptional";
export type PermanentReference={caseId:string;gu:number;gf:number;table:string};
type Table1Type=keyof typeof data.table1.types;
type PermanentDeclaration={permanentMode:"separate"|"grouped";
  actions:readonly ({nature:"permanent";caseId:string;permanentType?:string}|{nature:"variable";caseId:string})[]};

export function nbr8681PermanentReferenceFactors(d:PermanentDeclaration,kind:Nbr8681UlsKind):PermanentReference[]{
  return d.actions.flatMap(a=>{
    if(a.nature!=="permanent")return [];
    if(a.permanentType==="prestress"||a.permanentType==="settlement-shrinkage"){
      const [gu,gf]=data.table3[a.permanentType][kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 3"}];
    }
    if(d.permanentMode==="grouped"){const [gu,gf]=data.table2[kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 2"}];}
    if(!a.permanentType)throw Error("M42_PERMANENT_TYPE: tipo da Tabela 1 é obrigatório para "+a.caseId+" em permanentMode=separate");
    const row=(data.table1.types as Record<string,{normal:number[];special:number[];exceptional:number[]}>)[a.permanentType as Table1Type];
    if(!row)throw Error("M42_PERMANENT_TYPE: tipo "+a.permanentType+" inexistente na Tabela 1");
    const [gu,gf]=row[kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 1"}];
  });
}
