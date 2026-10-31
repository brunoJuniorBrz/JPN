# JPN — integração visual e coordenação estrutural (pré-missão Claude)

## Estado em 31/10/2026

A geometria paramétrica do JPN já gera peças (em **mm**), há um editor de preparação física (`workspace.spatialPreparation`, persistido em projetos/backups v4) e existe o motor experimental `jpn.frame3d/1` para modelos declarados. **Esses três recursos não equivalem a uma análise estrutural da cobertura gerada automaticamente.**

O painel **Roteiro estrutural** cria a continuidade de uso:

1. Na etapa **Resultado → Ferramentas do pré-projeto**, selecionar **Roteiro estrutural** (ou **Ver roteiro estrutural**).
2. Revisar seis frentes: geometria, materiais/seções, apoios, ligações/estabilidade, cargas/combinações e conectividade.
3. Abrir diretamente o formulário adequado para cada pendência, sem preencher JSON.
4. Consultar **Análise 3D experimental** (a análise de um *fixture* independente segue distinta da obra).
5. **Exportar pacote técnico para revisão**. É um objeto `jpn.spatial-handoff/1` com `analysis_ready:false`, `approved_for_fabrication:false` e `technical_status:"preliminary_not_analyzed"`. Traz ID de projeto, `structureSignature`, coordenadas `x_mm,y_mm,z_mm` (Z para cima), IDs/roles e conectividade visual das peças, declarações editáveis e diagnósticos de contatos. **Nunca envie esse objeto diretamente ao solver**. A informação de contato é observação geométrica; não indica ligação mecânica válida.
6. O painel de resultados de `jpn.frame3d-result/1` continua mostrando resultados apenas de **inputs físicos explicitamente válidos**, com resumo compacto de maior deslocamento resultante, maior reação e maior força normal absoluta em uma combinação (sem limites normativos, aprovação ou cálculo de fabricação).

## Garantias e limitações

- Nenhuma modificação em `generateStructure`, `src/domain/calculations/cutting.ts`, DXF, PDFs, seleção de perfis 3D, `engine/jpn_structural`, contrato do solver, requisitos de cálculos ou armazenamento de resultados; UI preserva o modo Acabado.
- O pacote não lê nem converte massa ou preço em propriedades resistentes. E/G/nu/A/Iy/Iz/J e hipóteses de liberação permanecem apenas **declarações do engenheiro**.
- Projetos antigos continuam sem `spatialPreparation` e podem abri-la sem migração. Alterar medidas/perfis invalida vínculo através de `geometrySignature`; dados antigos não são descartados.
- Os limites atuais do contrato `jpn.frame3d/1` são **100 nós e 200 barras**. A geometria visual padrão 10 × 20 × 4 m, duas águas, tem aproximadamente **120 nós e 207 barras**, sem segmentações adicionais. Não basta aumentar um número no Zod: validar também Python, memória, condicionamento, tempos, segurança e limites HTTP.
- Os contatos detectados por `spatialContacts` são diagnósticos. Nunca unir ou segmentar automaticamente barras sem decidir a existência e o tipo da ligação, transferência de esforços, eventual excentricidade, trechos de terças contínuas e contraventamento.
- `analysis_ready` não passa automaticamente a verdadeiro nesta entrega, mesmo quando todas as declarações do formulário forem preenchidas.
- Análise estática elástica de primeira ordem **não é verificação de resistência, flambagem ou aprovação ABNT**.
- O aplicativo na Vercel continua precisando de uma instância Python de análise e configuração segura para análises reais; isso não é resolvido por um painel novo.

## Arquivos principais para a próxima missão

- `src/domain/structure.ts`, `src/domain/calculations/structure.ts`: modelo visual e IDs.
- `src/domain/spatial-preparation.ts`: declaração rastreável e checklist.
- `src/domain/physical-declaration.ts`: propriedades dos grupos.
- `src/domain/spatial-coordination.ts`: pacote de troca preparado para próxima etapa.
- `src/domain/spatial-readiness.ts`: contatos físicos pendentes e validação conservadora.
- `src/domain/spatial-analysis.ts`: contrato estrito do solver (SI).
- `src/components/planning/spatial-coordination-panel.tsx`: fluxo mobile sem JSON.
- `src/components/planning/spatial-preparation-panel.tsx`: entrada das hipóteses físicas.
- `src/components/planning/spatial-analysis-panel.tsx`: interface do solver experimental e exemplos independentes.
- `src/app/api/analysis3d/route.ts`, `src/infrastructure/analysis/spatial-runner.ts`, `engine/jpn_structural/frame3d*.py`: análise e transporte existentes.
- `docs/ENTREGA-MOTOR-3D-EXPERIMENTAL.md`, `docs/PREPARACAO-ESTRUTURAL.md`: escopo e limitações.
- `src/domain/spatial-coordination.test.ts`, `tests/e2e/spatial-coordination.spec.ts`: testes do handoff mobile/desktop.

## A missão que deve ir para Claude depois desta entrega

**Objetivo:** implementar e validar o *adaptador físico*, não redesenhar a interface e não inventar propriedades ou aprovar uma estrutura. Ler estes arquivos e a CI antes de modificar. Criar branch separada. A partir das peças visuais e declarações fornecidas pelo engenheiro, identificar nós físicos, segmentação necessária, continuidade ou articulação e cadeia de transferência de cargas. Preserve rastreabilidade de IDs originais e dos segmentos gerados. Recuse modelos com topologia ambígua, dados faltantes, partes desconectadas ou apoios/estabilidade indefinidos.

**Ordem técnica:** (1) auditoria dos casos de junção e teste de 10 × 20 m, (2) contrato versionado de correspondência entre geometria e membros de análise, (3) pré-validador determinístico conservador, (4) converter somente modelos com vínculos e cargas declarados, (5) resolver limites/benchmark de >120 nós e >207 barras e condições numéricas, (6) testar referências analíticas e regressões, (7) conectar entrada validada ao endpoint 3D existente, exibindo erros por peça. Preservar solver 2D e 3D existentes. Se precisar de apoio do Claude para mudanças normativas, deixar para futura missão distinta.

**Critério de aceite:** ao menos um exemplo integrado com geometria, propriedades, apoios e cargas explícitas resolve o modelo validado sem inventar premissas; um projeto rápido incompleto continua corretamente bloqueado. Testes de conservação de unidades, IDs, esforços, reações e falhas de estabilidade com referências independentes, e CI completa. PR pronto para revisão; não fazer merge com falhas.
