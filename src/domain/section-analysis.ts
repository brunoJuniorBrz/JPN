import { z } from "zod";
const n=z.number().finite(),positive=n.positive().max(2000),text=z.string().trim().min(1).max(1000);
export const sectionAnalysisRequestSchema=z.object({schema_version:z.literal("jpn.section-analysis/1"),units:z.literal("mm"),
  geometry:z.discriminatedUnion("shape",[
    z.object({shape:z.literal("u-stiffened"),height:positive,width:positive,wallThickness:positive,lip:positive,insideRadius:n.nonnegative().max(2000)}).strict(),
    z.object({shape:z.literal("i"),height:positive,width:positive,webThickness:positive,flangeThickness:positive,insideRadius:n.nonnegative().max(2000)}).strict(),
    z.object({shape:z.literal("rectangle"),height:positive,width:positive}).strict(),
  ]),poisson:n.min(-.99).max(.499),source:text,revision:text,responsible:text,convergence:n.min(.00001).max(.01),
}).strict();
const properties=z.object({areaMm2:n.positive(),centroidYMm:n,centroidZMm:n,iyMm4:n.positive(),izMm4:n.positive(),iyzMm4:n,jMm4:n.positive(),warpingMm6:n,shearCenterYMm:n,shearCenterZMm:n,wyPositiveMm3:n.positive(),wyNegativeMm3:n.positive(),wzPositiveMm3:n.positive(),wzNegativeMm3:n.positive(),radiusYMm:n.positive(),radiusZMm:n.positive()}).strict();
export const sectionAnalysisResultSchema=z.object({schema_version:z.literal("jpn.section-analysis-result/1"),units:z.literal("mm"),input_sha256:z.string().regex(/^[a-f0-9]{64}$/),source:z.object({source:text,revision:text,responsible:text}).strict(),library:z.object({name:z.literal("sectionproperties"),version:z.literal("3.10.2"),license:z.literal("MIT")}).strict(),axes:text,properties,
  refinements:z.array(z.object({meshAreaMm2:n.positive(),nodes:n.int().positive().max(40000),properties}).strict()).length(3),
  convergence:z.object({status:z.enum(["observed","not-converged"]),relativeChanges:z.record(z.string(),n.nonnegative()),target:n.positive(),boundaryArcPoints:z.literal(64),errorBoundCertified:z.literal(false)}).strict(),elapsed_seconds:n.nonnegative(),normativeResistanceVerified:z.literal(false),effectivePropertiesComputed:z.literal(false),approvedForFabrication:z.literal(false),
}).strict();
