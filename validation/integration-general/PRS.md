# Matriz dos PRs — integração geral

Snapshot de 64 PRs abertos. A matriz JSON contém cada arquivo, blob de origem, hash da candidata e testes correspondentes.

`main`: `cc516b6f5cc97750de5aecf7564fcaff47a1d4f3`; cadeia validada: #83 `b228070020800055e835d5ba029224070b49199f`.

| PR | Funcionalidade | SHA | Estado | Testes / conferência |
|---|---|---|---|---|
| #83 | M43-P5 ? Orienta??es f?sicas e valida??o espacial com crit?rios estritos | `b228070` | ANCESTRY_PR83 | `engine/tests/test_p5_validation.py`, `src/domain/spatial-orientation.test.ts` |
| #82 | M43-P4 ? Converg?ncia dos p?rticos e motor corrotacional espacial experimental | `3f7569c` | ANCESTRY_PR83 | `engine/tests/test_p4_frame.py`, `engine/tests/test_p4_mechanics.py` |
| #81 | M43-P3 ? Consist?ncia de Kg, recupera??o de esfor?os e equil?brio f?sico P-? | `00ce874` | ANCESTRY_PR83 | `engine/tests/test_corotational_planar.py`, `engine/tests/test_pdelta_regression_baseline.py` |
| #80 | M43-P2 ? Motor experimental P-? para p?rticos f?sicos e auditoria de estabilidade | `696ae3f` | ANCESTRY_PR83 | `engine/tests/test_second_order_frame.py`, `src/infrastructure/analysis/local-second-order-frame-real.test.ts` |
| #79 | M43-P1: benchmark anal?tico P-Delta e auditoria de escopo linear do motor misto | `2b009d2` | ANCESTRY_PR83 | `engine/tests/test_m43_pdelta_reference.py`, `src/domain/declared-facade-mixed-real.test.ts` |
| #78 | M42-P1: auditar cobertura ELU/ELS, casos de vento e duplicidades sem presumir fatores normativos | `13b0ed4` | ANCESTRY_PR83 | `src/domain/declared-facade-mixed-real.test.ts`, `src/domain/engineering-combination-coverage.test.ts` |
| #77 | M41-P4: auditar carregamentos de fachadas nas barras reais do solver 3D | `c4f896b` | ANCESTRY_PR83 | `src/domain/declared-facade-mixed-real.test.ts`, `src/domain/declared-facade-traction.test.ts` |
| #76 | M41-P3: press?o l?quida de fachadas declarada e transmitida a pilares reais via PyNite | `5530151` | ADAPTED_EQUIVALENT | `src/domain/declared-facade-mixed-real.test.ts`, `src/domain/declared-facade-traction.test.ts` |
| #75 | Integra??o JPN: motor M35?M43-P1, a??es f?sicas e auditorias estruturais | `2b009d2` | ANCESTRY_PR83 | `engine/tests/test_general_topologies.py`, `engine/tests/test_m43_pdelta_reference.py` |
| #74 | M41-P2: conferir sobreposi??o global de fachadas e lacunas expl?citas de fechamento | `d7beb28` | ANCESTRY_PR83 | `src/domain/physical-facade-envelope.test.ts` |
| #73 | M41-P1: superf?cies verticais reais, front?es e aberturas para vento de fachadas | `4e82282` | ANCESTRY_PR83 | `src/domain/physical-facades.test.ts` |
| #72 | M40-P1: rastrear a??es reais de cobertura at? rea??es e interfaces f?sicas de apoio | `1b153b6` | ANCESTRY_PR83 | `src/domain/orthogonal-roof-cells-real.test.ts` |
| #71 | M39-P3: editar panos XYZ, vincular ter?as e auditar cargas reais na prepara??o estrutural | `35ac0db` | ANCESTRY_PR83 | `src/domain/declared-roof-load-path.test.ts`, `src/domain/orthogonal-roof-cells-real.test.ts` |
| #70 | M39-P2: distribuir cargas com conserva??o em telhados ortogonais em L e com recortes | `2d57fa0` | PATCH_EQUIVALENT | `src/domain/declared-roof-load-path.test.ts`, `src/domain/orthogonal-roof-cells-real.test.ts` |
| #69 | M39-P1: distribuir cargas de cobertura real para ter?as de geometria declarada | `74abcc4` | ANCESTRY_PR83 | `src/domain/declared-roof-load-path-real.test.ts`, `src/domain/declared-roof-load-path.test.ts` |
| #68 | M37-P2: auditar uni?o dos panos e associar ter?as ?s superf?cies f?sicas | `d7adaa9` | ANCESTRY_PR83 | `src/domain/physical-roof-coverage.test.ts` |
| #67 | M37-P1: superf?cies f?sicas de cobertura com contornos reais, aberturas e ?rea inclinada | `d5c7e65` | ANCESTRY_PR83 | `src/domain/physical-roof-faces.test.ts`, `src/infrastructure/analysis/remote-purlin-runner.test.ts` |
| #66 | M36-F: consolidar motor estrutural 3D, apoios f?sicos e transporte seguro | `e1e229b` | ADAPTED_EQUIVALENT | `engine/tests/test_general_topologies.py`, `engine/tests/test_vercel_purlin_http.py` |
| #65 | feat(integration): M36-F unificar motor geral, apoios f?sicos e transporte Python | `91f5293` | ADAPTED_EQUIVALENT | `engine/tests/test_vercel_purlin_http.py`, `src/infrastructure/analysis/remote-purlin-runner.test.ts` |
| #64 | feat(engine): M36-P2 vincular apoios em alvenaria, concreto e pilares a n?s f?sicos e rea??es | `5d323a5` | ANCESTRY_PR83 | `src/domain/support-interface.test.ts`, `src/domain/support-interfaces-real.test.ts` |
| #63 | feat(engine): M36 aceitar p?rticos puros, treli?as axiais e estruturas mistas no motor 3D | `8dee13e` | PATCH_EQUIVALENT | `engine/tests/test_general_topologies.py`, `src/domain/general-topologies.test.ts` |
| #62 | feat(engine): M35-P3 c?lculo de ter?as via backend Python protegido na Vercel | `b237969` | EXACT_EQUIVALENT | `engine/tests/test_vercel_purlin_http.py`, `src/infrastructure/analysis/remote-purlin-runner.test.ts` |
| #61 | feat(integration): trazer apoios mistos e demonstra??o Tom para a M35 do PR #60 | `4530587` | ANCESTRY_PR83 | `src/domain/client-demonstration.test.ts`, `src/domain/edit-declared-structure.test.ts` |
| #60 | WIP: consolidar melhorias visuais/Studio 3D e integra??es M35 | `28de4cf` | ANCESTRY_PR83 | `engine/tests/test_purlin.py`, `src/domain/declared-loading-real.test.ts` |
| #59 | feat(engine): M35-P2 cargas superficiais declaradas e peso pr?prio por ter?a | `28de4cf` | ANCESTRY_PR83 | `engine/tests/test_purlin.py`, `src/domain/purlin-traceability.test.ts` |
| #58 | feat(engine): primeira an?lise real de ter?as com compara??o de perfis e testes anal?ticos | `faca9a8` | ANCESTRY_PR83 | `engine/tests/test_purlin.py`, `tests/e2e/purlin-calculator.spec.ts` |
| #57 | feat(ux): apresenta??o guiada da M35.1 para o Tom, com navega??o m?vel simplificada | `c641f6a` | EXACT_EQUIVALENT | `tests/e2e/m351-presentation-ux.spec.ts` |
| #56 | feat(ux): assistente visual de barrac?es com escolhas ilustradas e 3D edit?vel | `cf2ceb1` | ANCESTRY_PR83 | `src/domain/quick-project-guided.test.ts`, `tests/e2e/quick-project-guided.spec.ts` |
| #55 | feat(ui): assistente visual de coberturas com alvenaria, apoios mistos e amplia??o parcial | `cdb6dab` | ADAPTED_EQUIVALENT | `src/domain/guided-support.test.ts`, `tests/e2e/guided-roof-supports.spec.ts` |
| #54 | M35.1: demonstra??o do cliente Tom e valida??o matem?tica utiliz?vel | `016dcf5` | ADAPTED_EQUIVALENT | `src/domain/client-demonstration.test.ts`, `src/domain/declared-loading-real.test.ts` |
| #53 | M35: estruturas declaradas, cargas distribu?das e quantitativos rastre?veis | `6a64398` | ANCESTRY_PR83 | `src/domain/declared-loading-real.test.ts`, `src/domain/declared-takeoff.test.ts` |
| #52 | test(audit): caso real Tom ? quantitativos, or?amento e limites da main integrada | `3fd6106` | ADAPTED_EQUIVALENT | `src/domain/tom-real-commercial.test.ts` |
| #51 | test(reference): dados auditados UFSC 2023 para valida??o futura do motor | `645884f` | MERGED_REFERENCE_DATA | `validation/ufsc-2023/validate-reference.mjs` |
| #49 | M34-A/B: estruturas declaradas e propriedades f?sicas por barra | `bdf21a3` | ALREADY_MAIN | `src/domain/m34ab-declared.test.ts`, `src/domain/m34ab-legacy-limits.test.ts` |
| #48 | feat(engine): cargas uniformes diretamente nas barras 3D + benchmark UFSC | `b179723` | EXACT_EQUIVALENT | `engine/tests/test_frame3d_member_uniform.py`, `engine/validate.py` |
| #47 | feat(3D Studio): medi??o entre n?s com suporte mobile | `f4fdc33` | ADAPTED_EQUIVALENT | `src/components/planning/node-measurement.test.ts`, `tests/e2e/studio-measurement.spec.ts` |
| #46 | M33-A: CI, origem normativa restrita e valida??o de fechamento | `91bf821` | ALREADY_MAIN | `engine/section_tests/test_exact_shape_cache.py`, `src/domain/m33a-solver-regression.test.ts` |
| #45 | research(m33): pr?-auditoria normativa e roadmap 3D sem retrabalho | `e505f4b` | MERGED_RESEARCH | Registro documental / conferência de blobs e ancestralidade |
| #44 | Miss?o 32: equil?brio reduzido, cFSM validado externamente e prot?tipo misto 3D | `566e068` | ALREADY_MAIN | `engine/section_tests/test_modal_kinematics.py`, `engine/section_tests/test_modal_numerics.py` |
| #43 | research(m32): handoff Claude e or?culos para segunda ordem mista | `0d7ebc2` | ALREADY_MAIN | `validation/mission32-handoff/test_m32_oracles.py` |
| #42 | research: matrizes de rigidez geom?trica e plano da segunda ordem mista | `45db574` | MERGED_RESEARCH | `validation/geometric-stiffness-audit/kg_reference.py` |
| #41 | M31: corrigir integridade resistente e auditar flambagem e segunda ordem | `5b3f854` | ALREADY_MAIN | `engine/section_tests/test_modal_numerics.py`, `engine/tests/test_buckling_search.py` |
| #40 | feat(ux): pend?ncias com corre??o direta e busca de pe?as 2D/3D | `291183a` | ADAPTED_EQUIVALENT | `src/components/planning/piece-search.test.ts`, `src/components/planning/result-presentation.test.ts` |
| #39 | feat(ui): resultado em quatro abas, 3D persistente e materiais agrupados | `6c70402` | ADAPTED_EQUIVALENT | `src/components/planning/result-presentation.test.ts`, `tests/e2e/mixed-local.spec.ts` |
| #38 | feat(engine): verifica??es isoladas NBR 14762 de parafuso e solda plana com testes | `95a5e55` | EXACT_EQUIVALENT | `engine/tests/test_flat_fillet_weld_14762.py`, `engine/tests/test_single_bolt_14762.py` |
| #37 | Motor experimental: auditoria, compress?o Ue autom?tica e vento parcial | `00e61f6` | ALREADY_MAIN | `engine/section_tests/test_elastic_strip.py`, `engine/section_tests/test_member_buckling.py` |
| #36 | docs: crit?rios obrigat?rios para conclus?o do motor estrutural M27?M30 | `b05c7fb` | ALREADY_MAIN | Registro documental / conferência de blobs e ancestralidade |
| #35 | M26 parcial: integrar M22?M25 e recuperar solicita??es cr?ticas cont?nuas | `51273a2` | ALREADY_MAIN | `src/domain/calculations/preproduction.test.ts`, `src/domain/connection-report.test.ts` |
| #34 | docs: preparar integra??o M22?M25 e verifica??es normativas Ue com benchmarks rastre?veis | `6c30227` | ALREADY_MAIN | Registro documental / conferência de blobs e ancestralidade |
| #33 | M24 parcial: a??es globais de liga??es e diagn?stico de estabilidade | `f2c94b7` | ALREADY_MAIN | `engine/tests/test_joint_actions.py`, `engine/tests/test_joint_http.py` |
| #32 | docs: campanha priorit?ria de valida??o com coberturas e galp?es de refer?ncia | `34eb8cf` | ALREADY_MAIN | Registro documental / conferência de blobs e ancestralidade |
| #31 | feat(engine): solicita??es concomitantes e relat?rio resistente bloqueado (M23 parcial) | `e97fb74` | ALREADY_MAIN | `src/domain/member-demands.test.ts`, `tests/e2e/resistance-report.spec.ts` |
| #30 | feat(engine): vento zonal conservativo e combina??es declaradas (M22) | `280a4c8` | ALREADY_MAIN | `src/domain/wind-load-path.test.ts`, `tests/e2e/loaded-mixed.spec.ts` |
| #29 | Miss?o 25: dossi? preliminar de materiais e pr?-fabrica??o PDF/Excel | `085c228` | ALREADY_MAIN | `src/domain/calculations/preproduction.test.ts`, `src/lib/exports/preproduction.test.ts` |
| #26 | feat(engine): refer?ncias el?sticas por pe?a para preparar dimensionamento | `0f4f9c9` | ALREADY_MAIN | `src/domain/resistance-elastic-reference.test.ts` |
| #25 | test(engine): auditoria independente do caminho de cargas da Miss?o 21 | `6921bb2` | ALREADY_MAIN | `src/domain/roof-load-path-independent.test.ts` |
| #24 | feat(engine): a??es por ?rea conservativas e regi?es preliminares (M21) | `02ad7ca` | ALREADY_MAIN | `src/domain/roof-load-path.test.ts`, `tests/e2e/roof-load-path.spec.ts` |
| #23 | feat: JPN 3D Studio ? inspe??o por camadas, isolamento e c?mera m?vel | `91129e0` | ADAPTED_EQUIVALENT | `src/components/planning/profile-geometry.test.ts`, `tests/e2e/profiles-3d.spec.ts` |
| #22 | feat(JPN): cat?logo t?cnico integrado ? obra original, sem pre?os nem dimensionamento | `243ab80` | ALREADY_MAIN | `src/domain/published-profile-catalog.test.ts` |
| #21 | feat(JPN): triagem preliminar de inc?ndio SP e alternativas geom?tricas | `700af6a` | RESEARCH_UI_BLOCKED | `src/domain/fire-feasibility-sp.test.ts` |
| #20 | feat(engine): integra??o remota mista segura e smoke HTTP (18B) | `ee04006` | ALREADY_MAIN | `engine/tests/test_vercel_mixed_http.py`, `src/domain/loaded-mixed.test.ts` |
| #19 | fix(engine): entrada WSGI Vercel e HTTP misto autenticado | `adea5a8` | ALREADY_MAIN | `engine/tests/test_vercel_mixed_http.py` |
| #13 | feat(deploy): Vercel Hobby Python functions for 2D/3D solver | `d529ae8` | SUPERSEDED_NOT_MERGED | `engine/tests/test_vercel_purlin_http.py` |
| #1 | Experimento: validar motor 2D com PyNiteFEA (n?o integrar ainda) | `f08cb0d` | SUPERSEDED_NOT_MERGED | `engine/validate.py` |
