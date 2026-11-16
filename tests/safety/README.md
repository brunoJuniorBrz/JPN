# Bloqueios estruturais

A suíte Vitest `src/domain/structural-release-invariant.test.ts` inspeciona
propriedades e atribuições executáveis de todos os arquivos de produção TS/TSX.
Schemas devem usar literais falsos; o único delegador permitido do gate é
`buildEngineReleaseGate`, conferido também em execução para modelos mistos e
garagem, em primeira e segunda ordem. Revisão profissional continua não concedida.

`engine/tests/test_structural_release_invariant.py` usa AST do Python para
conferir os produtores do motor, inclusive os nomes históricos em snake_case.
O CLI experimental `mixed_initial_stress.py` mantém seu estado histórico
`BLOCKED`; os outros gates permanecem `NOT_READY_BLOCKED`.

Os manifestos fixam as ocorrências mínimas dos produtores existentes, para
detectar remoções. Novas ocorrências são inspecionadas automaticamente.
Mutações em memória demonstram que true, valores variáveis e gates liberados
fazem as guardas falharem. Nenhum arquivo produtivo é modificado pelos testes.

Executar:

```text
npx vitest run src/domain/structural-release-invariant.test.ts src/domain/engine-release-gate.test.ts
python -m pytest engine/tests/test_structural_release_invariant.py -q
```

Ambos são descobertos pelas suítes existentes da CI. A inspeção estática é
uma guarda adicional dos contratos atuais, não uma prova formal de todo código
arbitrário futuro. Ela não substitui regressões de fluxo, validação física ou
revisão profissional obrigatória. Não atualizar manifestos para encobrir remoção
de bloqueios ou aceitar liberação sem autorização e verificação aplicáveis.
