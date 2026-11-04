# Mapa factual da integração JPN — após M32

**Leitura verificada em GitHub em 04/11/2026.** Esta é a correção de uma recomendação anterior incorreta: NÃO é necessário desenvolver uma missão para "integrar M26 → M32". Esses trabalhos já estão na cadeia de ancestrais da M32. O que ainda falta é selecionar mudanças paralelas, validar uma candidata de produto e decidir sua promoção à main.

## 1. Ancestralidade confirmada por `compare_commits`

| Comparação | GitHub informa | Consequência |
| --- | --- | --- |
| `main...feat/m26-integrated-normative-engine` | `ahead=69; behind=0` | Main é ancestral do código M26 |
| `feat/m26-integrated-normative-engine...feat/m27-m30-structural-engine-complete` | `ahead=5; behind=0` | M27–M30 incorpora M26 |
| `feat/m27-m30-structural-engine-complete...feat/m32-numerics-mixed-second-order` | `ahead=11; behind=0` | M32 incorpora M31, preparação M32 e implementações M32 |
| `main...feat/m32-numerics-mixed-second-order` | `ahead=85; behind=0` | **A M32 já é o acumulado técnico M26–M32**, ainda não promovido à main |
| `feat/m32-numerics-mixed-second-order...research/m33-normative-preflight-and-visual-roadmap` (antes deste adendo) | `ahead=3; behind=0` | PR #45 contém apenas documentação, NÃO é implementação M33 |

Comparações API `compare_commits` para `main` podem listar no máximo 300 arquivos nesta resposta; não usar isso como contagem total do checkout. Commits informados pela API podem variar com referência, data e base de comparação; não confundir isso com estatísticas de diff local `main...branch`.

Cadeia principal:
```
main
  └─ PR #28 (release candidate M21 + Studio 3D) → M22–M25
       └─ PR #35 M26
            └─ PR #37 M27–M30
                 └─ PR #41 M31
                      └─ PR #43 material M32
                           └─ PR #44 código M32
                                └─ PR #45 somente docs preparação M33
```
O desenho indica dependência de *código contido na ancestralidade*, não significa que cada PR esteja mesclado na main ou que todos devam receber merge individual.

## 2. Trabalho paralelo que a M32 NÃO contém

| PR | Confirmação | Destino recomendado |
| --- | --- | --- |
| **#38** — verificações isoladas de parafuso e solda plana | `engine/jpn_structural/single_bolt_14762.py` e `flat_fillet_weld_14762.py` NÃO existem no HEAD da M32; branches divergentes | Preservar como pesquisa/validação isolada para M36, NÃO arrastar para M33 |
| **#39** — Resultado em quatro abas, materiais agrupados e canvas 3D persistente | `src/components/planning/result-presentation.ts` e `docs/RESULTADO-ABAS-UX.md` NÃO existem na M32 | Avaliar integração **seletiva** no candidato do produto, testando mudanças de layout e rotas com motor atual |
| **#40** — busca de peças e pendências com correção contextual | `src/components/planning/piece-search.ts` NÃO existe na M32; #40 é empilhado sobre #39 | Integrar após #39 em candidato de UI, sempre com testes e revisão de regressão |
| **#42** — estudo de matriz geométrica | PR exclusivo de pesquisa, não incorpora sua branch à M32 | Preservar pesquisa separadamente; não é requisito de merge para M33 |
| **#45** — pré-auditoria M33 e roadmap 3D | Arquivos de documentação; o código M32 não muda | Consultar como briefing, não promover automaticamente como feature |
| **#23** — Studio 3D | Branch histórica divergiu da M32, mas o PR #28 documenta merge controlado de Studio; `docs/STUDIO-3D-INSPECAO.md` e componentes já existem na M32 | **NÃO repetir** a implementação só porque a branch histórica aparece divergente |

**O Modo Acabado já existe** em `docs/MODO-ACABADO-3D.md` e `src/components/planning/presentation-scene.ts`. Não criar novo visualizador para M33 nem reconstruir Studio.

## 3. Próxima ação correta (sem duplicação)

**Checkpoint de integração do produto, não uma nova missão do solver:**
1. Partir do HEAD de produção em desenvolvimento do **PR #44** (confirmar SHA e PR atual). Não reimplementar M26–M32 nem tentar mesclar cronologicamente cada PR antigo.
2. Auditar e incorporar **seletivamente #39/#40** se a interface em abas e a busca/contexto forem desejadas no beta; são branches do Studio antigo e podem conflitar com edições posteriores de `planning-editor.tsx`, `structure-preview.tsx`, `project-workbench.tsx` e e2e. Preferir portar intencionalmente funcionalidades em vez de um merge cego.
3. Manter **#38** isolado até a campanha de ligação/resistência M36, e **#42/#43/#45** como documentação/pesquisa de apoio; não carregar todo PR experimental ao release sem critério.
4. Criar **candidata de integração** e executar: instalação por locks, typecheck, lint, Vitest, Playwright (inclusive celular emulado), Python/solver/perfis opcionais, build, preview real e inspeção manual em iPhone. A CI verde da M32 não valida automaticamente UI #39/#40.
5. Decidir a promoção para `main` **separadamente**, após revisão dos riscos de 85 commits de diferença. Não fazer merge, deploy ou alterar `fabricationRelease` só por resultados de testes.
6. **M33 pode ser desenvolvida a partir do HEAD da M32** em branch própria, usando o PR #45 como documentação, enquanto a promoção para main segue revisada. Se o objetivo imediato for uma base única de produto antes de continuar, fechar primeiro o checkpoint UI; não é pré-requisito matemático para começar o provedor de vento.
7. Após originar e testar vento + combinações (M33), a **M34 integra a experiência de obra inteira**, M35 confronta com memoriais independentes e M36 fecha resistências, estabilidade e ligações de um domínio delimitado.

## 4. Responsabilidades e limites

**Trabalho de apoio já feito:** inventário de arquivos, comparação de ancestrais, identificação das branches que realmente ficaram de fora, documentação de risco e briefing de M33. Isso NÃO representa código de UI integrado.

**Trabalho que precisa de checkout + execução de testes:** portar seletivamente #39/#40, resolver conflitos, validar snapshots e UI, executar testes com lock; após, implementação normativa M33. Não afirmar que o merge foi feito ou que o código funciona antes da execução.

**Gate de fabricação:** continua `NOT_READY_BLOCKED`. Nenhum resultado de UI, CI, solver linear ou bibliotecas parciais desbloqueia a aprovação integral.
