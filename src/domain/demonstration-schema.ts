import {z} from "zod";

export const technicalDataLabels={
  trusses:"Geometria e posição real das tesouras",
  purlins:"Posição, comprimento e apoios das terças",
  sections:"Seções e propriedades físicas dos perfis",
  materials:"Materiais e respectivas fontes",
  connections:"Tipos de ligação",
  supports:"Apoios e restrições",
  loading:"Características da cobertura e carregamentos",
  wind:"Informações necessárias para ações do vento",
} as const;
export type TechnicalDataKey=keyof typeof technicalDataLabels;
export const demonstrationSchema=z.object({
  version:z.literal(1),kind:z.enum(["tom-commercial","mathematical-validation"]),
  parentProjectId:z.uuid().optional(),
  technicalData:z.partialRecord(z.enum(Object.keys(technicalDataLabels) as [TechnicalDataKey,...TechnicalDataKey[]]),z.object({information:z.string().max(2000),source:z.string().max(1000)}).strict()).optional(),
}).strict();
export const VALIDATION_NOTICE="MODELO DE VALIDAÇÃO MATEMÁTICA — NÃO REPRESENTA A ESTRUTURA DO TOM.";
export const DEMO_SOURCE_COMMIT="6a64398d1e4d12577d816efb07d8483767ff4459";
