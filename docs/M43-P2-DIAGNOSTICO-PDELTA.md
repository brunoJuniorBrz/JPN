# M43-P2 — protótipo P-Delta integrado e bloqueado

**Decisão da investigação:** entregar o protótipo isolado autorizado pela missão. A recuperação de esforços e o equilíbrio completo de cargas mortas não foram suficientemente verificados para habilitar um motor P-Delta produtivo. Todos os candidatos são `diagnostic-rejected`, HTTP **422**, `production_enabled=false`, `physical_convergence_verified=false`, `normative_stability_verified=false`, `computed_structural_approval=false`, `fabrication_release=false`, `NOT_READY_BLOCKED`.

## Base consolidada

- #78: `13b0ed4e056e590b510b503c423b453853f8280d`, ancestral de #79, com CI aprovada.
- #79: `2b009d2aeff8b3e0c512cac5e0025fe02e702eea`, CI [pull request](https://github.com/brunoJuniorBrz/JPN/actions/runs/42880022457) e [push](https://github.com/brunoJuniorBrz/JPN/actions/runs/42880013316) aprovadas, 9/9 jobs.
- #75 estava em `c1d8622`, exatamente um commit atrás, zero divergências. Avançado **por fast-forward** para `2b009d2`; nenhum conflito ou trabalho descartado.
- Branch nova `feat/m43-p2-second-order-frame-engine` criada de `2b009d2`. `main` preservada em `cc516b6f5cc97750de5aecf7564fcaff47a1d4f3`. Sem merge ou deploy de produção.

## Implementação

`jpn.second-order-frame/1` envolve a mesma requisição física preparada pelo JPN, com hash do modelo, preparação e mapeamento. O novo envelope seleciona explicitamente o diagnóstico; o antigo `jpn.mixed3d/1` ou `/2` continua selecionando somente análise linear. Os dados do modelo elástico são reutilizados, não reinterpretados como uma ativação implícita de P-Delta.

`build_mixed_model` e `audit_elastic_model` extraem a montagem e as verificações já existentes do motor, mantendo as operações lineares. O piloto reutiliza esses mesmos materiais, seções, apoios, combinações, conferência geométrica, base local, mecanismos e condicionamento. Não há um solver numérico novo no navegador.

`prepareSecondOrderFrameAnalysis` → cliente `diagnoseSecondOrderFrameProject` → `/api/experimental/second-order-frame` → worker Python já limitado pelo sistema operacional → auditoria independente TypeScript → `buildSecondOrderFrameReport`. A preparação usa o **Project salvo e os adaptadores físicos existentes**. O relatório diagnóstico tem hash e invalidação por revisão, separados do relatório resistente. Este último recusa o contrato diagnóstico.

A rota exige ambiente de desenvolvimento local, origem/Host de loopback, cabeçalho próprio e opção `JPN_LOCAL_SECOND_ORDER_ENABLED=1`; fica desabilitada por padrão, inclusive em produção. Não existe transporte remoto P-Delta habilitado. Reutiliza memória **768 MiB**, prazo **20 s**, entrada **500 kB**, saída **2 MB** e o mesmo slot/circuit breaker do executor misto. Cancelamento e JSON bruto com chaves duplicadas permanecem conferidos. A branch está bloqueada nas duas configurações Git/Vercel.

O refinamento numérico é explícito nos parâmetros e rastreado por membro original e intervalo; não cria apoios, ligações ou peças físicas. Material, seção, giro, ações e combinações não mudam. Limites existentes de 150 nós/320 elementos e guardas de movimento de 1% do vão global e 0,05 rad são mantidos. Modelos com `Spring3D`, liberações, UDL ou peso próprio são **recusados**, sem trocar a barra axial por pórtico nem concentrar artificialmente ações.

## Comportamento real do PyNite 3.2.1

1. O método faz a solução elástica, monta Kg com os esforços axiais dessa etapa e resolve com Ke+Kg. `max_iter` regula a iteração de elementos unilaterais, não uma tolerância Newton de equilíbrio não linear. O piloto bilateral observou **uma montagem Ke e uma Kg por combinação**, duas soluções; registra iterações físicas não lineares como **null**.
2. A recuperação `Member3D.f` usa novamente a força derivada do encurtamento axial posterior. Os sinais medidos usam `(d6−d0)EA/L`: compressão é negativa. Não se interpreta uma documentação de sinal como substituto da medição e da referência analítica.
3. No cantilever a 20% de Pcr, a flecha do candidato é próxima da referência exata, mas o residual de momento em geometria deslocada é aproximadamente **−0,24674 N·m**. O termo `H·uz` e a diferença montagem/recuperação não desaparecem por declarar o método convergido. Residual algébrico pequeno é registrado separadamente do equilíbrio físico.
4. A matriz tangente é auditada antes de aceitar deslocamentos: positividade, condicionamento e razão mínima generalizada `(Ke+Kg)/Ke`. A guarda **0,6** é uma restrição do piloto inspirada no intervalo cantilever já ensaiado até 40%; não é fator normativo, K efetivo ou homologação de outros pórticos. O erro de arredondamento da comparação é calculado pelo tamanho do sistema/espectro.
5. O método nativo, sem as guardas externas, retornou valor finito até em **101% do Pcr cantilever: −1,051 m** no topo. O protótipo recusou esse modelo com `PDELTA_INSTABILITY`; recusou 60%, 79% e 95% com `PDELTA_DOMAIN_MARGIN`. A guarda antiga de 80% não foi promovida a domínio validado.

Os resíduos globais auditam FX/FY/FZ e MX/MY/MZ com cargas mortas nos nós deslocados, sem eliminar termos para fazer o ensaio passar. Translações/rotações em graus fixos e reações em graus livres também são recusadas. São verificados refinamento 2:1 de deslocamentos, rotações e ações nas extremidades físicas dos membros, sem misturar unidades. As tolerâncias permanecem **1e-8 para os resíduos** e **1e-4 para o refinamento**.

## Referências executadas

E=200 GPa, A=0,02 m², geometria e seções **sintéticas**, materiais elásticos com fonte explícita. Não representam o Tom. Todos os vínculos são declarados; não se atribui rigidez a alvenaria ou fundações.

- **A:** cantilever M43-P1, 0/5/20/40% do seu Pcr, H positivo/negativo, solução analítica independente; malhas explícitas e três forças/três momentos. A fórmula e seus limites permanecem documentados na M43-P1.
- **B:** dois pilares de 4 m e viga de 6 m, bases engastadas, forças gravitacionais e laterais. Malhas 16/32. A escala de P usa valores numéricos derivados do ensaio A; **não atribui K=2 nem Pcr global ao portal**. O caso de maior compressão foi recusado pela margem, pois H também altera os esforços axiais.
- **C:** mesmo pórtico com diagonal **de pórtico soldada explicitamente declarada**, com EA/EI e conexões rígidas conhecidas, sem novos apoios. Não equivale a uma diagonal axial `Spring3D` nem valida contraventamento de obra desconhecida.
- **D:** quadro espacial com quatro pilares e quatro vigas, carregamentos X/Y/Z, Iy/Iz distintos, rotações e seis componentes de reação. Malhas 8/16, dentro dos limites existentes.
- **E:** ausência de apoios, mecanismo, liberações recusadas, compressão excessiva, trecho real de 1 mm em série com 3999 mm (mal condicionado), falha nativa simulada, substituição indevida por análise linear, recuperação NaN, orçamento de malha excedido, contrato não SI e mudanças físicas com hash obsoleto.

OpenSeesPy **3.8.0.0** (núcleo OpenSees **3.8.0**) foi executado em **outro interpretador**, com `-I`, a mesma malha/ações/seções e transformação PDelta; referência linear também executada. Newton, 10 incrementos, `NormDispIncr=1e-12`, máximo 50 iterações por incremento; os números efetivos são registrados. A referência não importa PyNite/JPN. Os binários ficam privados; não integram dependências, aplicação ou deploy JPN. Uso apenas de validação interna, conforme [licenciamento e instalação OpenSeesPy](https://openseespydoc.readthedocs.io/en/latest/).

**Resultado: oito tentativas, sete comparações completas executadas, duas atendem a todos os limites e cinco têm discrepâncias registradas.** A oitava não é declarada comparada: a margem do protótipo a recusou antes do cálculo. As verificações incluem todos os nós, vetores XYZ/rotações, reações e 12 ações globais de cada elemento. Critérios preservados: relativo 1e-7 na comparação linear; 2e-3 na comparação entre operadores P-Delta; absolutos 1e-10 m/rad e 1e-5 N/N·m. O limite relativo de comparação acomoda a ordem de erro de discretização dos operadores distintos, não dispensa os resíduos físicos de 1e-8. **Discrepâncias próximas de zero não foram apagadas nem receberam tolerância maior.**

| Caso, P por pilar | DX candidato (mm) | DX OpenSees (mm) | Norma de M no mesmo B0: candidato/linear |
|---|---:|---:|---:|
| A, 123370 N | 13,297867278 | 13,297700768 | 1,205070 |
| B, 123370 N | 2,304311236 | 2,304241246 | 1,065163 |
| C, 123370 N | 0,089560156 | 0,089557568 | 0,991217 |
| D, 123370 N | 1,152122159 | 1,151981919 | 1,053284 |

Os valores são **candidatos recusados**, não esforços liberados para dimensionamento. A diagonal reduz a deriva, mas isso não aprova resistência ou estabilidade. A razão de momentos compara o mesmo apoio/caso, não envelopes de posições diferentes. Exemplo de discrepância: no centro da viga B sem gravidade, My ≈ 0,0000963 N·m no PyNite versus 0,0001656 N·m no OpenSees, fora do absoluto 1e-5 fixado. Campos internos ainda não estão homologados mesmo quando o deslocamento se aproxima.

[Evidência numérica completa, violações e hashes LF da fonte](../validation/m43-p2/evidence.json). [Verificação real no navegador](../validation/m43-p2/http-browser-proof.json): cantilever e quadro 3D retornaram 422 pelo Next e worker real; origem externa recebeu 403. Não há nova jornada visual de dimensionamento nesta entrega.

## Reprodução e CI

```text
python -m pytest -c engine/pyproject.toml engine/tests -q
python -m venv .tools/opensees
.tools/opensees/Scripts/python.exe -m pip install --require-hashes -r validation/m43-p2/requirements-opensees.lock
python validation/m43-p2/reproduce.py --opensees-python .tools/opensees/Scripts/python.exe
npx.cmd pnpm@12.15.0 typecheck
npx.cmd pnpm@12.15.0 lint
npx.cmd pnpm@12.15.0 exec vitest run src/infrastructure/analysis/local-second-order-frame-real.test.ts src/infrastructure/analysis/local-mixed-real.test.ts src/infrastructure/analysis/local-mixed-lifecycle.test.ts src/infrastructure/analysis/local-mixed-process.test.ts
npx.cmd pnpm@12.15.0 build
```

Usar Python 3.12, requisitos fixados do projeto e uma thread BLAS, como na CI. Em Linux, o executável privado é `.tools/opensees/bin/python`; não resolver seu symlink para o Python base. Para a rota local, configurar `JPN_PYTHON_EXECUTABLE`, `JPN_LOCAL_SECOND_ORDER_ENABLED=1` e iniciar `node scripts/dev-structural.mjs`. O ponto de integração da aplicação é `diagnoseSecondOrderFrameProject(project,numerics)`: retorna relatório bloqueado e revalida a mesma preparação física após a resposta.

Validação local: 30 testes específicos Python, 23 testes TypeScript críticos, typecheck/lint sem erros (três avisos preexistentes em testes não alterados), além da campanha Python de 1760 casos executada antes das quatro últimas regressões de entrada. **Resultados e SHA da campanha final completa estão no PR M43-P2**, incluindo Linux/Windows, Vitest, Playwright e build. O job `independent-pdelta-diagnostics` testa execução e rejeição segura; sua aprovação **não declara equivalência numérica de todos os casos**, cujas falhas permanecem no artefato.

Referência primária do operador independente: [PDeltaCrdTransf](https://openseespydoc.readthedocs.io/en/latest/src/pdelta.html). A transformação nodal não inclui automaticamente P-δ interno de um único elemento; as subdivisões são explícitas nos dois modelos. A implementação efetivamente inspecionada é a distribuição PyNiteFEA 3.2.1 instalada, não uma documentação de outra versão.

## M43-P3

1. Resolver a consistência entre N usado em Kg e N/esforços recuperados; implementar e observar convergência física real, ou adotar formulação independente devidamente validada/licenciada.
2. Definir e validar precisamente a formulação de equilíbrio (pequenas deformações de viga-coluna versus geometria finita), sem suprimir resíduos para passar testes. Fechar as discrepâncias de momentos internos com referências independentes.
3. Validar liberações pela condensação conjunta Ke+Kg, carregamentos distribuídos/peso próprio e seu trabalho/equilíbrio antes de habilitá-los. Kg axial `Spring3D` exige formulação própria independente; permanece proibido.
4. Somente depois ampliar vínculos, imperfeições, rigidezes, modos de flambagem e integração visual revisável. Não atribuir K, rigidez de paredes, capacidade de ligação/fundação ou fatores normativos por suposição.

**Pode ser usado:** investigação local, comparação e diagnóstico rastreável, sem alteração dos cálculos lineares existentes. **Ainda bloqueado:** segundo-ordem produtivo, seleção definitiva de perfis, ligações, fundações, memorial homologado e fabricação. Marco M43 permanece parcial; PR draft para revisão humana, sem merge na main.
