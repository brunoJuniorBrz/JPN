# M23 parcial — solicitações e preparação resistente

## Escopo e base

Base exata do PR #30: `280a4c89b6e41a2a5295142dcd2b5bfc6d7208e0`, branch `feat/engineering-m22-m24`. HEAD confirmado sem commits posteriores. A [CI 41459494014](https://github.com/brunoJuniorBrz/JPN/actions/runs/41459494014) terminou em success antes deste desenvolvimento. Nova branch: `feat/m23-resistant-design`; PR em rascunho contra a M22, sem merge/deploy. Deploy Git da nova branch desabilitado nos dois arquivos Vercel.

O diretório recebido não contém `.git`. Snapshot isolado `.tools/mission23-worktree` preparado a partir dos arquivos da árvore remota, conferidos por hash Git. A publicação utiliza a conexão GitHub. Nenhum módulo reservado à M25, quantitativo, preço, corte, CAD ou fabricação foi alterado. Matemática e arquivos Python permanecem idênticos à base; não existe segundo solver.

## Entrega funcional

`member-demands.ts`, contrato derivado `jpn.member-demands/1`:

- Consome resultados reais `jpn.mixed3d-result/1` e `/2`, validando schemas, versão, hash da entrada, projeto/revisão, combinações, IDs, tipos e rastreabilidade das cargas antes da extração.
- Confere mapeamento, nós mm→m, comprimentos, intervalos t0/t1, continuidade orientada e cobertura integral de cada peça original. Segmentos de uma peça de pórtico devem manter material, seção e giro.
- Preserva `peça → segmento → combinação → estação → vetor concomitante N/Vy/Vz/T/My/Mz`. Não combina máximos de componentes que ocorreram em posições ou combinações diferentes.
- Guarda extremos mínimo, máximo e absoluto como referências a linhas completas. N positivo é tração; negativo é compressão. Todos os valores internos estão em SI.
- Pórticos: copia as cinco estações do contrato carregado, sem reutilizar recuperação de cargas nodais para UDL. No contrato nodal v1, reutiliza exclusivamente a função existente `mixedStations`.
- Axiais: duas posições nas extremidades com N constante do segmento; cortantes, torção e flexão são **null/não aplicáveis ao modelo**, nunca zeros inventados.
- Posições em metros tanto no segmento quanto na peça original; translação local nas estações quando fornecida. Translações e rotações globais nodais são preservadas com o indicador de graus rotacionais ativos. Não se interpola rotação no interior.
- Preserva giro da seção e IDs de material/seção. O contrato misto não retorna a matriz de eixos globais do pórtico: ela não foi reconstruída nem utilizada para transformar tensões.

**Limite explícito:** são extremos das amostras disponíveis. Cinco estações não garantem o máximo contínuo de momento, deslocamento ou interação; nenhuma busca de extremos entre elas foi implementada. Na segmentação, ambas as faces do encontro conservam sua identidade/estação.

`resistance-report.ts`, `jpn.resistance-report/1`:

- Reconstrói a preparação atual com o adaptador existente e exige correspondência exata de hash físico, hash de preparação e mapeamento da análise. Não executa outro solver.
- Vincula relatório à entrada, preparação, declaração resistente e conteúdo completo do resultado por SHA-256. Verificação de atualidade antes de exportar; alterações de geometria, cargas, fatores, aço, propriedades, contenções, norma ou resultado invalidam a derivação.
- Reúne solicitações e cadastro por peça. Verificações de tração, compressão, flexão, cisalhamento, torção, interação e serviço permanecem **pendentes**. Formados a frio têm também bloqueio explícito de flambagem local/distorcional e propriedades efetivas. Outros perfis não recebem silenciosamente o procedimento de formados a frio, ou vice-versa.
- Não emite `ATENDE`, `NÃO ATENDE`, resistência de cálculo ou utilização. Peças continuam incompletas e a estrutura `NOT_APPROVED_FOR_FABRICATION`.
- Controle separado N/A em MPa, somente tensão média axial elástica; não representa tensão extrema sob flexão, resistência ou segurança. Referências de escoamento bruto/Euler já existentes continuam identificadas como idealizadas e não normativas.

Cadastro: extensão opcional e compatível de `resistancePreparationSchema` para designação física, forma e dimensões em mm, origem e revisão. Não deriva propriedades das dimensões visuais ou do nome comercial. Diagnósticos incluem fu<fy, dimensões degeneradas/incompletas, ausência de referências/contenções e conflito de A/I/J com os valores físicos efetivamente usados no solver. Dimensões declaradas não são convertidas em propriedades aprovadas automaticamente.

Interface: leitura na análise existente, seleção de peça sincronizada com o 3D, tabela geral por componente e tabela da peça com vetores concomitantes, dados físicos, pendências, controle N/A e exportação JSON preliminar. Formulário pequeno para geometria física quando já existe cadastro resistente. A alteração invalida a análise atual; nenhum editor JSON de vento foi duplicado. Relatórios derivados não são gravados nos quantitativos ou apresentados como projeto de fabricação.

## Referências e bloqueio normativo

As edições editoriais identificadas na auditoria precedente e mantidas como referência são NBR 8800:2024 Versão Corrigida:2025, NBR 14762:2010 e NBR 8681:2025 ([Catálogo ABNT](https://www.abntcatalogo.com.br/default.aspx?P=M6V7DQ6JE0Z9), [DIN 14762](https://www.dinmedia.de/en/standard/abnt-nbr-14762/180821430), [DIN 8681](https://www.dinmedia.de/en/standard/abnt-nbr-8681/396242177)).

A investigação priorizou U/U enrijecidos formados a frio. O [acervo oficial CBCA](https://www.cbca-acobrasil.org.br/site/biblioteca?bsc=ativar&bscPgn=1&bscQtdReg=10&chkCat%255B%255D=7), consultado em 02/11/2026, identifica também o manual Uso Fácil da NBR 8800:2024, atualizado em 11/12/2025. Os downloads exigem login/cadastro. Não foram criadas contas nem acessadas cópias de terceiros para contornar essa exigência.

**Cláusulas normativas efetivamente aplicadas: nenhuma. Família com dimensionamento normativo concluído: nenhuma.** Não houve acesso legítimo suficiente ao procedimento integral e exemplos de validação para completar uma família. Um texto escrito pelo usuário no campo de referência não habilita fórmulas ou aprovação.

Faltam, por procedimento:

| Verificação | Referência ainda necessária |
|---|---|
| Tração | Texto aplicável de escoamento bruto, ruptura efetiva/líquida, reduções e transmissão de forças, fatores e limites de aplicação |
| Compressão | Modos globais pertinentes, propriedades efetivas, imperfeições e fatores; para U/U enrijecido também local/distorcional e flexo-torção |
| Flexão/cisalhamento/torção | Procedimentos completos da família, seção efetiva/classificação, instabilidade lateral, contenções e reduções pertinentes |
| Interação | Equações e condições de simultaneidade da família e domínio escolhido; amostragem suficiente para pontos críticos |
| Serviço | Combinações, limites, referência de flecha e critérios de medição aplicáveis |

Números de cláusulas não consultadas não foram inventados. **O critério 3 da missão está bloqueado; esta entrega não é dimensionamento normativo concluído.** A arquitetura não transforma Euler ou tensão média em resistência de cálculo.

## Validação independente e evidências

Ver [checks.json](validation/mission23/checks.json) para comandos, contagens, tempos e limitações. Baseline direcionada de propriedades/carregamentos anteriores: 10 aprovados.

Os testes novos executam Python 3.12 e PyNiteFEA 3.2.1 reais, sem mocks como prova de cálculo:

1. Balanço de 4 m, seccionado em 3+1 m, E=200 GPa, Iy=Iz=1e−5 m⁴ e giro 37°. UDL −100 N/m e tração de 1000 N. Referências independentes: `N=1000 N`, `|V(x)|=100(4−x)`, `|M(x)|=50(4−x)²`, flecha `q x²(6L²−4Lx+x²)/(24EI)` e rotação de extremidade `qL³/(6EI)`. A mola axial transversal declarada não introduz rigidez no plano desse carregamento. As posições originais amostradas são 0; 0,75; 1,5; 2,25; 3; 3; 3,25; 3,5; 3,75; 4 m.
2. Combinações com máximos distintos: C1 contém N=1000 N e UDL de referência; C2 contém N=100 N e o dobro da UDL; C3 inverte UDL e aplica N=−2000 N. A solicitação concomitante associada ao máximo de flexão permanece N=100 N, não o máximo axial de outra combinação.
3. Barra axial de 2 m e A=0,001 m²: +1000/−2000 N e extensão `NL/(EA)`; nó exclusivamente axial sem rotações ativas; nenhuma componente fictícia de flexão.
4. Contrato v1 com carga nodal: momento linear `P(L−x)` e translação local interna indisponível explicitamente null.
5. JPN → M22 → PyNite real → relatório: cobertura sintética gerada 10×20×4 m, 132 nós, 207 peças e 243 segmentos; relatório de todas as peças e bloqueios de formados a frio. Não se trata de uma treliça comercial dimensionada.
6. Conversões independentes conhecidas: 10 kN/10 cm²=10 MPa; −5 kN/2 cm²=−25 MPa, duplicação da força e da área; rejeição/pendência para zero, NaN, infinito e subfluxo numérico.
7. Hash/versão/IDs/mapeamento/comprimentos/estações corrompidos, resultado de falha, revisões obsoletas, alteração do resultado ou relatório, propriedades inconsistentes e backup do cadastro.

Os limites físicos anteriores permanecem. A extração é limitada pelos contratos existentes de até 320 segmentos, dez combinações e cinco estações por pórtico. Tempos incluem inicialização e não constituem benchmark dedicado de memória ou limite de desempenho.

| Comando | Resultado local |
|---|---|
| Baseline Vitest direcionada | 10 aprovados |
| Novos testes direcionados | 10 aprovados com dependências Python reais |
| `python engine/validate.py` | 1444 aprovados; zero erros/falhas/skips; 1000 comparações independentes; 65,25 s |
| `pnpm typecheck`, `pnpm lint` | Exit 0; lint sem erros/avisos |
| `pnpm test` | 313 aprovados; zero falhos/pendentes |
| `python tests/verify_dxf.py` | 130 linhas 3D, unidade mm, zero erros de auditoria ezdxf |
| `pnpm test:e2e` | 65 aprovados; zero falhos/skips/flaky; 316,94 s |
| Playwright afetado final | 3 aprovados em 43,95 s: relatório 375/1440 px e cadastro físico/editabilidade |
| `pnpm build` | Exit 0, inclusive após o ajuste final do cadastro |

Na revisão final foi identificado por leitura do código que o formulário legado poderia descartar os novos campos opcionais ao editar fy/fu. Correção mínima: preservar o cadastro existente antes de sobrescrever os campos editados. O teste final registra geometria física, invalida a análise, edita fy, executa Python novamente e comprova a conservação das dimensões/designação no relatório. Também foi protegido o download assíncrono contra mudança de revisão enquanto a conferência está em andamento. Após esses ajustes de interface, repetidos somente testes afetados, TypeScript, lint e build; não houve repetição da campanha integral ou alterações matemáticas.

Durante o desenvolvimento, uma verificação TypeScript apontou nós potencialmente indefinidos; a guarda de erro foi explicitada antes do uso. Não houve falha nos novos testes matemáticos direcionados ou na campanha integral. A CI do novo PR deve ser acompanhada separadamente: o sucesso da base não é usado como prova da nova branch.

Ambiente: Windows, Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4, SciPy 1.18.1, Node 24.13.0, pnpm 12.15.0; BLAS/OMP/MKL em uma thread. Testes de viewport não comprovam execução em aparelho iPhone físico. Não houve novo smoke HTTP remoto ou publicação nesta missão.

## Pendências e próximo incremento

A M22 ainda depende de validação normativa de coeficientes/combinações; classificar uma combinação como ULS/SLS não a homologa. M24 continua responsável por ligações, ancoragens, contenções reais, estabilidade global e efeitos adicionais, com revisão do engenheiro. A ausência desses procedimentos impede aprovação global.

Próxima tarefa de maior impacto: obter acesso legítimo às cláusulas integrais e exemplos independentes de uma família/situação delimitada, começar por um procedimento resistente completo, integrá-lo aos vetores concomitantes e recusar os domínios incompatíveis. Antes de ampliar verificações, resolver a localização contínua de pontos críticos exigida pelo procedimento escolhido.
