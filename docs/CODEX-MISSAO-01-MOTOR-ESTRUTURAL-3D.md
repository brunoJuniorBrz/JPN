# JPN — Missão Codex 01: motor estrutural espacial experimental, auditável e integrado
**Data do briefing:** 31/10/2026. **Baseline auditada:** `a0e70d23d9998b1561ed0c562af1f563105b7849` em `main`.
**Usuário:** engenheiro estrutural/industrial que atende clientes principalmente no celular. **Prioridade:** confiabilidade da análise, menor preenchimento antes de chegar ao 3D, revisão/edição e posterior otimização por massa, **não preços**.

> **Esta missão NÃO autoriza fabricação.** Entregar análise estática experimental de estruturas espaciais com hipóteses explícitas, resultados reproduzíveis e uma integração funcional; **não** alegar dimensionamento ABNT, perfil seguro, solda aprovada, otimização de material ou pedido de corte.

## 0. Forma de trabalhar e prioridades

1. Ler antes de alterar: `README.md`, `docs/DIMENSIONAMENTO.md`, `docs/AUDITORIA-MOTOR.md`, `docs/PREPROJETO.md`, `engine/README.md`, `src/domain/structure.ts`, `src/domain/calculations/structure.ts`, `src/domain/analysis.ts`, `src/domain/quick-project.ts`, `src/domain/workspace.ts`, `src/infrastructure/analysis/runner.ts`, `src/app/api/analysis/route.ts`, `src/components/planning/analysis-panel.tsx`, `src/components/planning/project-workbench.tsx`, `src/components/planning/structure-3d.tsx` e a suíte existente.
2. Criar branch `feat/experimental-spatial-analysis` a partir da `main` mais recente; registrar SHA base; não fazer push direto na `main`.
3. Executar baseline antes de mudanças e registrar resultados. Preservar fluxo "Novo projeto → medidas mínimas → Perfis 3D", visualizador e orçamento. Não redesenhar interface.
4. Propor e implementar a **menor arquitetura correta** para um módulo 3D isolado, bem testado, com interface mínima. Dar preferência a bibliotecas consolidadas, sem reinventar MEF. Documentar licença, versão fixada e limites do solver.
5. Prioridade de entrega, se houver restrição de execução: **contratos 3D + solver + validação independente > adaptador geométrico seguro > painel mínimo > aparência**. Não declarar concluído o que não passou em testes reais.
6. Não fazer perguntas comuns de implementação; decidir e registrar justificativa. Só solicitar dados impossíveis de inferir de maneira responsável (por exemplo, valores reais de vento, vínculos e propriedades de aço), mantendo-os como pendências. Nada de inserir números falsos para conseguir uma resposta.

## 1. Estado real do projeto

- Next.js/React/TypeScript, Zod; Three.js 3D; `localStorage` com snapshots v4 e backups; frontend e orçamento existentes.
- `src/domain/quick-project.ts`: gera automaticamente a geometria 1/2 águas de forma preliminar; perfis de **visualização sintética**, sem massa, preços, aço, E ou propriedades resistentes confiáveis. Nunca usar esses perfis como insumo de análise.
- `src/domain/calculations/structure.ts`: gera `StructureModel` com nós `x,y,z` em **mm** e peças entre eixos (column/topChord/bottomChord/web/purlin), não um modelo de elementos finitos. Coordenada `z` é vertical.
- A geometria atual pressupõe dois pilares por tesoura e pode criar terças encontrando banzos **fora dos nós**; há cruzamentos/coincidências geométricos que **não demonstram ligação mecânica**. Falta modelagem explícita de contraventamento, conexões, excentricidades, fundações e estabilidade espacial. Não assumir que as peças que se tocam estejam rigidamente ligadas.
- `engine/jpn_structural/`: solver NumPy/SciPy `jpn.truss/1` **2D, axial, linear, articulado**, com validação independente por PyNite. Preservar integralmente esse contrato e os testes históricos.
- `src/domain/analysis.ts`/painel de análise: apenas **uma tesoura T1 isolada** com cargas nodais e apoios explícitos; `/api/analysis` e `runner.ts` têm modo Python local e serviço HTTPS remoto com limite de corpo/resposta/tempo.
- `src/domain/calculations/cutting.ts`: heurística First Fit Decreasing de **simulação**, não detalhamento fabril nem corte autorizado. Não mexer nesta missão.
- Projeto mantém persistência/backup e edições em perfis. Há testes Playwright em mobile/desktop. Verificar últimas mudanças antes de modificar arquivos.

## 2. Entrega exigida — análise estrutural 3D experimental

### 2.1 Contratos novos, versionados e estritos

Criar contrato estável, documentado em Python **e** TypeScript/Zod, por exemplo `jpn.frame3d/1` → `jpn.frame3d-result/1`, mantendo `jpn.truss/1` imutável. Definir com clareza:
- Sistema global (X,Y,Z) com **Z para cima**, em unidades SI no solver: m, N, Pa, m², m⁴ e N·m. Conversões de mm, cm², GPa, kN feitas **apenas na fronteira**, com testes.
- Nós XYZ, barras identificadas por IDs originais, tipo estrutural declarado (frame com flexão/torção ou axial quando suportado de modo consistente), propriedade de seção `A, Iy, Iz, J`, material `E,G` e fonte/identificação/versionamento. Ângulo/orientação dos eixos locais explícito. Não inferir propriedades resistentes a partir de nome, seção 3D visual ou espessura presumida.
- Apoios com os 6 graus de liberdade identificados e declarados `UX, UY, UZ, RX, RY, RZ` (recalques somente se implementados corretamente). Não travar todos os pilares na base sem confirmação do usuário.
- Ligações/liberações por extremidade explícitas e verificadas. Avisos claros para sistemas de treliças e pórticos mistos. Não usar restrições artificiais para disfarçar singularidades.
- Casos de carregamento separados, inicialmente ao menos **forças/momentos nodais**, e se compatível/validado, **cargas pontuais e distribuídas em membros**. Distinguir eixos locais/globais, sentidos, posições, unidades e fonte. Casos `D`/`L`/`W` são **rótulos**, não cálculo automático do vento.
- Combinações identificadas com coeficientes **fornecidos explicitamente**, sem construir coeficientes normativos inventados. Se não houver combinações, expor a situação como pendente, não aplicar `1.0` silenciosamente.
- Identificador de projeto/revisão e **hash canônico de todo o input analisado**: nós, peças, materiais, seções, apoios, releases, cargas, combinações e parâmetros. Não basta o hash existente de geometria.
- Limites de tamanho, tipo, magnitude, finitude, IDs exclusivos, conectividade, comprimentos e referências. Erros estruturados em português na UI e códigos estáveis no backend.

### 2.2 Solver de confiança

- Avaliar primeiro **PyNiteFEA** na versão fixada do projeto (`3.2.1` em `engine/requirements-validation.lock`, verificar API instalada) como motor de pórticos/barras 3D. Preferir biblioteca real ao código próprio de elementos de pórtico reescrito do zero. Separar adaptador da biblioteca, contrato e apresentação.
- Implementar **análise elástica linear estática, primeira ordem**, primeiro; documentar que ela não comprova estabilidade global, flambagem, resistência, comportamento de ligação ou segurança.
- Se acrescentar P-Delta, não fazê-lo só porque há API; precisa escopo/hipóteses/validação independentes. Pode deixar explicitamente para a próxima missão.
- Para cada caso/combinação solucionado, obter deslocamentos e rotações nodais; reações de força/momento; ações internas dos membros (**N, Vy, Vz, T, My, Mz**) em extremidades e posições significativas, segundo convenção documentada; diagnósticos de equilíbrio, estabilidade numérica e convergência; versão da biblioteca; hash.
- Corrigir convenções, unidade, eixo local e sinal com testes, inclusive membros invertidos e girados. Não produzir zero/estado `success` em caso de matriz singular, componentes desconectados, dependência ausente, não convergência, condição numérica inadequada ou dado físico incompleto.
- Um estado `analysis_completed_experimental` significa **somente análise**, nunca `design_approved` ou `safe_for_fabrication`.
- Não usar `sectionproperties` para justificar resistência normativa. Se integrar propriedades geométricas nesta missão, fazê-lo em módulo isolado, auditável e com referências/limites de geometria. Caso contrário deixar como interface preparada e pendência.

### 2.3 Adaptador seguro JPN → análise

- Não fazer conversão ingênua de `StructureModel.pieces` em `FEModel3D.members` supondo juntas rígidas, continuidade, contraventamentos ou apoios.
- Construir pré-validador que identifique **terças cruzando/encontrando banzos entre nós**, cruzamentos sem nó, elementos colineares sobrepostos, cargas distribuídas e caminho de cargas, apoios implícitos, tipo de ligação indefinido, contraventamento ausente, instabilidades evidentes. Não gerar estruturas fisicamente desconectadas com aparência de pórtico íntegro.
- Fornecer **diagnóstico de preparo para análise**, com lista específica do que falta, por peça/nó quando possível, distinguindo `visual_ready` de `analysis_ready`.
- Para um caso bem definido e explícito, mapear geometria/apoios/cargas/seções reais ao contrato 3D e executar o solver. Se a geometria JPN ainda não puder ser representada fielmente, **bloquear análise daquela obra e explicar por quê**, enquanto o usuário continua visualizando o 3D e editando normalmente.
- Incluir ao menos um **exemplo estrutural 3D explícito** (pórtico simples com apoios/propriedades/carga declarados) para demonstrar solução e resultados integrados. Esses valores são fixture de validação; nunca defaults comerciais da entrada rápida.
- **Não** assumir automaticamente vento por cidade, massa própria, sobrecarga de telhado ou que uma conexão soldada seja rígida. Peso próprio só se material/densidade/seção e opção de ativação estiverem explicitamente definidos e validados.
- Manter todas as decisões editáveis; análises devem ficar obsoletas ao alterar qualquer hipótese do hash.

### 2.4 Integração com aplicação, preservando UX rápida

- Reutilizar ou expandir o `runner.ts`, a API Node e o serviço Python remoto sem quebrar `/api/analysis` existente. Nova rota/contrato pode ser independente. Impor limites de corpo e saída, timeouts, limite de concorrência, segurança de origem/token/HTTPS e tratamento de indisponibilidade (Vercel não dispõe automaticamente do processo Python).
- Incorporar **painel avançado de Análise 3D experimental**, acessível depois de abrir o modelo 3D; entrada inicial continua com poucas medidas e 3D imediato.
- Estados explícitos e legíveis no celular: "Modelo visual pronto", "Faltam dados para análise", "Análise experimental executada", "Modelo alterado: resultado desatualizado", "Instabilidade/erro" e "Serviço de análise indisponível".
- Interface mínima para especificar/revisar condições e apresentar resultados com unidades, fonte, combinação e advertências. Evitar layout pesado/desempenho ruim em 375px; não exigir custos nem estimativas de preço.
- Não inventar campos nos backups existentes: se persistir novos dados, migração v4→v5 sem perda de projetos, materiais, documentos, revisões e backups antigos. Preferir nova área opcional; cuidar de compatibilidade ida/volta conforme regras do repositório. Não sobrescrever a análise 2D existente. Nunca persistir um resultado como atual depois de mudar o modelo.
- Não alterar o visualizador Three.js desnecessariamente. Se destacar esforço/resultado no 3D, indicar o caráter experimental e manter a seleção de perfis e câmera funcionando.

## 3. Testes obrigatórios (não se contentar com testes que só importam módulos)

**Antes de codificar**, coletar baseline; **depois**, executar toda a CI atual e novas provas.

### Análises independentes e sinais físicos
1. Barra axial 3D com `δ=PL/(EA)`, reações e sinais. Caso em X, Y e Z e membro invertido.
2. Viga em balanço com força na extremidade, `δ=PL³/(3EI)`, momento no engaste `PL`, esforço cortante `P`; orientação forte/fraca `Iy`/`Iz` separadas.
3. Viga de dois apoios com carga central: reações `P/2`, momento `PL/4`; comprovar interpretação do tipo de apoio.
4. Pórtico plano embutido em 3D com resultado independente publicado/analítico. Pórtico espacial com torção/excentricidade e referência externa **independente do próprio solver**.
5. Momento torsor em barra com `θ=TL/(GJ)` dentro das hipóteses adotadas.
6. Combinações: linearidade, superposição, soma de reações/equilíbrio (forças e momentos), reversão de carga, ordem de IDs e transformações rígidas de coordenadas.
7. Caso de carga no meio do elemento e carga distribuída: comparar reações, esforços e deslocamentos quando implementados, **não dividir a carga por igual entre nós sem fundamento**.
8. Entradas ruins: ausência de E/G/A/I/J, propriedades falsas do modo rápido, nós duplicados, zero comprimento, membro órfão, carga em nó inexistente, combinações inválidas, instabilidade singular e resultantes não finitos. Falhar com código específico, sem sucesso parcial enganoso.
9. JPN 10×20 m rápido **não** deve passar a `analysis_ready` apenas por ter 3D sólido; testes de ausência de apoios/cargas/contraventamentos e de ponto de contato não conectado.
10. Alterar perfil, rotação local, comprimento, apoio, liberação, carga ou combinação deve invalidar o hash do resultado. Salvamento e backup antigos continuam válidos.

**Não** usar apenas PyNite como oráculo do próprio PyNite: usar fórmulas analíticas, equilíbrio independente e, quando necessário, comparação com segundo solver/testes publicados que não usem o mesmo cálculo interno.

### Compatibilidade e implantação
- Executar no ambiente com **Python 3.12, Node 24, pnpm 12.15.0**:
  `python engine/validate.py`;
  `npx --yes pnpm@12.15.0 typecheck`;
  `npx --yes pnpm@12.15.0 lint`;
  `npx --yes pnpm@12.15.0 test`;
  `npx --yes pnpm@12.15.0 test:e2e`;
  `npx --yes pnpm@12.15.0 build`.
- Rodar Python em Windows **e** Linux via GitHub Actions; nunca enfraquecer, apagar ou ignorar testes 2D/Playwright para fazer a CI ficar verde.
- Testar HTTP local, indisponibilidade Python, timeout, limites, resposta inválida, serviço remoto simulado, rastreabilidade hash. Não exigir credenciais privadas para os testes.
- E2E desktop (1440) e iPhone simulado (375), sem regressão de `Novo projeto → Gerar modelo 3D → Perfis 3D`, edição e recarga. Na ausência do backend remoto, a visualização e levantamento devem continuar.
- Para performance: medir tempo/memória do solver em pequenas estruturas e em um modelo de tamanho realista, com limites impostos e interrupção segura; registrar ambiente e resultados sem prometer escala que não foi testada.

## 4. Entregáveis que fazem a missão valer os créditos

1. Contratos Zod e Python versionados, documentação de coordenadas, unidades, nomenclatura e sinais.
2. Módulo Python 3D com testes analíticos/benchmark independentes, erros claros e integração Node/serviço HTTP. Preservar o solver 2D legado.
3. Adaptador/prevalidador que não invente conexões e demonstre de maneira verificável quando um JPN pronto visualmente ainda **não** está pronto para cálculo.
4. Pelo menos uma análise espacial válida, com entradas declaradas, mostrada no aplicativo em painel técnico no computador e celular.
5. Testes novos de contratos, análise, validação, regressão de UX, API, persistência; documentação dos casos e evidências verificáveis.
6. Relatório `docs/ENTREGA-MOTOR-3D-EXPERIMENTAL.md`: o que foi implementado; biblioteca/versão/licença; casos validados e limites de erro; benchmarks; riscos; quais verificações normativas, ligações e cargas não foram implementadas; passos para execução local e servidor; pendências da fase seguinte.
7. Abrir PR com mudanças; comunicar SHA base, SHA final e status real dos testes. **Não** fazer merge se houver testes falhando ou regressão funcional.

### Critério objetivo de aceite
A missão estará completa quando **a análise 3D experimental resolver um pórtico estrutural explicitamente especificado e validado por referências independentes**, retornar deslocamentos/reações/esforços com unidades e diagnóstico, recusar modelos incompletos/instáveis, integrar isso ao JPN sem afetar a criação rápida, e passar a CI completa. Não confundir com dimensionamento normativo ou liberação fabril.

Se não conseguir isso totalmente, entregar a parte validada, erros e pendências precisas num PR em rascunho. Não afirmar conclusões que não foram demonstradas.

## 5. Fases seguintes (NÃO executar nesta missão)

- **Missão 02 — catálogo e dimensionamento normativo:** dados reais de fabricantes, seções e classes de aço rastreáveis; propriedades geométricas (possível `sectionproperties`); ações e combinações fundamentadas em cópias autorizadas das normas aplicáveis; verificação de resistência/estabilidade/deformações com relatórios por equação e caso de carga. Normas a avaliar pela edição vigente: **ABNT NBR 8800:2024 Versão Corrigida:2025; ABNT NBR 6123:2023; ABNT NBR 8681:2025**. Não copiar texto normativo protegido ou implementar fórmulas adivinhadas; obter acesso autorizado e revisão independente por engenheiro.
- **Missão 03 — otimização por consumo de aço (não preço):** comparar somente configurações que cumpram **todas** as verificações implementadas, documentar restrições/ausências, minimizar massa ou comprimento comercial; sem aprovar opções com verificações faltantes. Avaliar `pymoo` quando a função objetivo/restrições forem confiáveis.
- **Missão 04 — ligações e fabricação:** soldas, parafusos, chapas, ancoragens, excentricidades, contraventamentos e comprimentos finais; validação técnica; depois otimização de barras comerciais (`OR-Tools`) e arquivos para compra/corte. Nunca equiparar comprimento entre eixos a comprimento final de fabricação.

## Referências de partida (confirmar APIs instaladas, datas e licenças)

- PyNite: https://pynite.readthedocs.io/en/latest/ — pórticos 3D, casos e combinações, apoios e cargas; observar sign conventions, liberações e tipos de análise.
- PyNite versão 3.2.1: https://pypi.org/project/PyNiteFEA/3.2.1/
- sectionproperties: https://sectionproperties.readthedocs.io/en/latest/
- Documentação ABNT em `docs/DIMENSIONAMENTO.md` e fontes oficiais de edição vigente; texto integral exige licença/autorização.
