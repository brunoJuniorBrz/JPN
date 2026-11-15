# INT-1c — contrato de combinações sem o teto de 10

`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. Números e hashes de `/1`, `/2` e dos `/3` já emitidos não mudam.

## Decisões
1. **Limite derivado do orçamento de execução, não uma contagem.** Casos: até `MAX_CASES = 40`. Combinações: até `MAX_COMBINATIONS = 256` *e* o menor valor para o qual a resposta única ainda cabe sob o limite de saída de 2 MB (HTTP e executor local): `combination_limit(nós, pórticos, axiais, cargas distribuídas, pesos próprios)`. Bytes por elemento medidos em resultados `/3` reais (nó 185 B, pórtico com 5 estações 1227 B, equilíbrio 156 B) e arredondados para cima com margem; fatia de segurança de 95 % do limite. A mesma regra está em `engine/jpn_structural/analysis_limits.py` e em `src/domain/analysis-limits.ts`; um teste executa o Python e exige igualdade com o TypeScript. Passar do limite devolve `INPUT_LIMIT` com o número permitido (nada é descartado em silêncio). Um modelo muito grande (132 nós/207 pórticos/36 axiais) fica com poucas combinações: é o limite de 2 MB do transporte, não um número arbitrário.
2. **Envoltória única, mesmo `input_sha256`.** Todas as combinações vão em **uma** requisição e **uma** execução; o `input_sha256` do resultado é o hash da requisição completa; locais e remoto rodam o mesmo worker.
3. **Superposição só no caminho linear; contrato aceita resolução por combinação.** Campo opcional `solution_mode` (somente `/3`; ausente = superposição linear, hash dos `/3` existentes inalterado): `linear-superposition` (resolve uma vez e superpõe os casos) ou `per-combination` (cada combinação é um modelo próprio). No motor linear os dois dão os mesmos números (teste: 1e-9); `per-combination` já existe no contrato para a futura segunda ordem (M43), onde a superposição é inválida. Qualquer outro valor: `UNSUPPORTED_SOLUTION_MODE`. O resultado devolve `solution_mode` e o formato do resultado não muda.

## Onde o 10 fixo existia e foi trocado
`spatial-analysis.ts`, `spatial-preparation.ts`, `engineering-combinations.ts` (ações, termos, combinações), `declared-service.ts`, `declared-facade-traction-contract.ts`, `structural-loading.ts` (áreas) e `mixed3d.py` (`LIMITS`). O gerador NBR 8681 deixa de limitar a 10 (`maxCombinations` até 256).

## Aceite
- Galpão sintético (anel de 8 pilares, G, Q e 4 direções de vento NBR 6123 → 8681 com 2 conjuntos de permanentes e ELU+ELS): **30+ combinações em uma execução** `/3` pelo executor local, equilíbrio < 1e-8 em todas, mesmo `input_sha256`, resposta < 2 MB (`src/domain/analysis-limits.test.ts`).
- Local e remoto iguais: o backend HTTP (`engine/app.py`, WSGI → worker) e o solver local produzem o mesmo resultado (36 combinações, sem modo, `linear-superposition` e `per-combination`) e recusam do mesmo modo acima do limite (`engine/tests/test_remote_local_parity.py`).
- Limites do Python: estimativa conservadora contra o tamanho real; modelo grande com o limite exato e a resposta real < 2 MB (`engine/tests/test_analysis_limits.py`).

## Não feito
Compressão/paginação da resposta (modelos grandes continuam limitados a poucas combinações); segunda ordem (M43) propriamente dita; rota remota de design/assessment.
