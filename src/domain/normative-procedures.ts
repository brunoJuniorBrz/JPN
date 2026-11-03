/** Availability is not execution, PASS, member completion or structural approval. */
export const availableNormativeProcedures=["NBR14762:2010-C.3","NBR14762:2010-C.4","NBR14762:2010-C.5","NBR14762:2010-9.6.2","NBR14762:2010-9.7.2.2","NBR14762:2010-9.7.4","NBR14762:2010-9.8.3","NBR14762:2010-9.9","NBR14762:2010-10.1(a)","NBR6123:2023-4.2","NBR6123:2023-5.3.3"] as const;
export const normativeProcedureRegistry=availableNormativeProcedures.map(id=>({id,availability:"implemented-experimental" as const,execution:"not-executed" as const,completeFamily:false as const}));
