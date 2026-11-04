# M33-A — origem normativa de vento e combinações

Base: PR #44, `566e068010446c3af8cb4889391ac177dcf752e3`, confirmado no GitHub.
Branch: `feat/m33a-normative-wind-combinations`; PR draft, sem merge/deploy.
Código efetivamente testado: `84c7248d6ce32a5516f613c69fa95be4b5b7bd12`; o commit posterior publica apenas evidências/fechamento.
O preflight e o mapa foram consultados em `research/m33-normative-preflight-and-visual-roadmap`, HEAD `e505f4b`, sem merge.

## Auditoria das fontes fornecidas

A ausência de `data/normas` na base **não era ausência de documentos ABNT fornecidos**.
O inventário histórico registra cinco documentos com SHA256, edição e páginas, incluindo o print da NBR 8681:2025.
Foram auditados o histórico Git, `ENTREGA-RESISTENCIA-UE-MRD.md`, `ENGINE-NORMATIVE-TRACEABILITY.md`, implementações e fixtures.
A tabela inicial de rastreabilidade é explicitamente histórica; entregas posteriores registram documentos e procedimentos efetivamente utilizados.
Não houve nova leitura dos PDFs neste computador nem busca por normas pagas. PDFs, imagens e textos integrais não são redistribuídos.

Inventário original: `docs/validation/coldformed-design/supplied-standards.json`.
Inventário atual de procedimentos, hashes e limites: `data/normas/source-audit-m33a.json`.
Commits principais: `aa80040` (resistência após fontes), `00e61f6` (vento/automação parcial), `b32fb29` (exposição isolada), `5b3f854` (comparações M31).

| Procedimento/dado | Norma / edição / item | Estado e domínio | Teste / comparação independente | Limitação |
|---|---|---|---|---|
| S1, S2, Vk, q | 6123:2023 **original**, 4.2, 5.2(a), 5.3.3, Tabelas 1–3 | SUPPORTED_VERIFIED para fórmulas parciais existentes, terreno plano, rugosidade uniforme, I–V/A–C | `wind-speed.test.ts`; valores tabulados; REF-04/01 para S2 | V0, S3 e classificação declarados; errata 2025 não verificada |
| b, p, zg, zmin e Fr | Mesmo subconjunto e PDF SHA `338214bb…` | Recuperados do código já testado; Fr da categoria II em todas as categorias | 15 combinações categoria/classe e testes preexistentes | Não constitui tabela completa de vento |
| Cpe, Cpi e zonas normativas | 6123:2023 original, itens específicos ainda sem transcrição recuperável | BLOCKED_UNSUPPORTED no fluxo real sem arquivo aplicável | Seleção e adversariais com TEST_ONLY; conservação independente | Documento foi fornecido; faltam **linhas numéricas com domínio/origem** no Git |
| Distribuição às terças | Mecânica existente, `q*(Cpe-Cpi)` | Reutilizada, sem média de Cpe | Uma/duas águas, pressão/sucção, incidências 0/90, forças e momentos | Corte longitudinal de peça bloqueado; cobertura global estática/fechada |
| Gamma/psi e receitas ELU/ELS | 8681:2025; captura SHA `85573943…`, 18 páginas PDF, leitura histórica até página numerada 23 | BLOCKED_UNSUPPORTED sem transcrição aplicável | Fixtures sintéticas de principal/acompanhantes, efeitos favoráveis/desfavoráveis e exclusão | Leitura registrada não reconstrói os fatores; não usar 2003 |
| Compilação e envoltórias | Contrato existente `engineering-combinations/1` | Aritmética de estudo DECLARED_UNVERIFIED | Fatores rastreados, lotes ≤10, ID governante por finalidade | Não transforma `pending-engineer-review` em verificado |
| Compressão/flexão MRD | 14762:2010, C.1–C.4 | Fórmulas existentes com fatores resistentes 1,20/1,10; gates atuais preservados | Decimal e campanhas M31/M32 existentes | Condicionais; modos automáticos antigos exigem avaliador /4 |
| Tração, cortante, interação | 14762:2010, 9.6.2, 9.8.3, 9.9 | Existentes: 1,10/1,35/1,65 na tração; kv=5 para uma alma; N/M concomitantes | Testes resistentes já existentes; nenhuma resistência nova | Torção, demais almas/modos e ligações não completados |
| Inércia de serviço / demanda axial de junta | 14762:2010, C.5 e 10.1(a) | Procedimentos parciais existentes | Testes preexistentes | Não aprovam ELS integral nem resistência da junta |
| Texto e errata fornecidos | 8800:2024 + Errata 1:2025, SHA `f2feef74…`, 298 páginas | Proveniência disponível; implementação resistente completa BLOCKED_UNSUPPORTED | Inventário e histórico | Fora desta execução; a tabela antiga de “sem texto integral” não descreve a entrega posterior |
| Gravitacional | 6120:2019 original, SHA `7567f441…`, 66 páginas | DECLARED_UNVERIFIED: densidades/peso próprio e ações de área explícitas já existem | Física/testes existentes | Faltam tabelas normativas, aplicabilidade e correções; sem código gravitacional novo |
| Aprovação/fabricação | Gate existente | NOT_READY_BLOCKED; dois flags de liberação falsos | Teste adversarial do gate | Nenhum PASS parcial aprova projeto/obra |

## Dados recuperados e contratos novos

`data/normas/nbr6123-2023-speed.json` preserva exatamente os valores já usados:
S1=1 no domínio restrito; S2=b·Fr·(max(z,zmin)/10)^p; Vk=V0·S1·S2·S3; q=0,613·Vk²; densidade de referência 1,226 kg/m³.
Cada valor herda norma, edição, errata, domínio e transcritor do catálogo e possui seu item no grupo correspondente; categoria/classe completam a seleção.
`wind-speed.ts` passa a consumir esse arquivo, preservando `2023-original`, contratos e flags existentes.

Os esquemas Zod exportados estão em `src/domain/normative-origin-contracts.ts`:

- `normativeWindDataSchema`: revisão/origem; linhas exatas de tipologia, queda, inclinação, incidência, intervalos dimensionais e aberturas completas; zonas fracionárias retangulares e todos os casos de Cpi; fonte por coeficiente.
- `normativeFactorsDataSchema`: edição **2025**, uso, receitas por finalidade, ação principal, fatores por classe/categoria/papel/efeito; gamma e psi com fontes próprias.
- Cada fonte exige norma, edição/errata, item/tabela/figura, domínio, transcritor e SHA256 do documento. Estado “verificado” fornecido por JSON é recusado.

O carregador real lê somente `data/normas/nbr6123-2023-cpe.json` e `data/normas/nbr8681-2025-fatores.json`.
Esses dois arquivos de valores **não foram encontrados no Git auditado**; isso não nega a existência histórica dos PDFs/captura.
Arquivo ausente, malformado, valor faltante, edição 2003 ou domínio ambíguo produz BLOCKED_UNSUPPORTED e motivo.
Não há interpolação, extrapolação ou substituição por Cpe médio. Zonas incompatíveis com o distribuidor são bloqueadas.
O domínio inicial exige edificação fechada e parâmetros completos; aberturas desconhecidas, regiões compostas e outros domínios não são inferidos.

Fixtures em `src/domain/test-support/m33a-fixtures.ts` são TEST_ONLY_NOT_NORMATIVE.
O fluxo real recusa esse marcador inclusive nas fontes internas se alguém apenas alterar a origem do cabeçalho.
O harness sintético exige NODE_ENV=test. Valores importados do proprietário permanecem DECLARED_UNVERIFIED; não se cria homologação automática.

## Integração, rastreabilidade e invalidação

`normative-origin.ts` reutiliza `calculateWindSpeed`, `distributeWindActions`, `compileEngineeringCombinations` e `adaptLoadedMixedProject`.
Os fatores de resistência da 14762 não são fatores de ações da 8681. Sua referência datada a 2003/6.7 permanece uma compatibilidade separada.
As receitas enumeram a principal, acompanhantes, hipóteses favoráveis/desfavoráveis e exclusões, mantendo zeros explícitos com origem.
Pedidos de ELU/ELS sem receita/fator são bloqueados. A expansão tem limite 256, sem truncamento, e é dividida em lotes de até dez combinações existentes.
As envoltórias são separadas por finalidade e preservam assinatura e ID do caso governante.

A assinatura SHA256 inclui geometria, preparação física/ações, entradas normativas, conteúdo/revisões dos arquivos, catálogo recuperado e versão do provedor.
Mudança em qualquer base invalida o resultado. Resultados editados ou importados por JSON não concedem execução verificada.
`materializeNormativeOriginStudy` entrega cópias para revisão; a adaptação conserva os gates físicos e a revisão existente de possível dupla contagem.
Não confirma automaticamente independência de cargas, não inventa apoios/liberações e não modifica o solver.

## Referências e validação desta execução

As fixtures REF-01/04 já estavam registradas antes da comparação em `docs/validation/mission31/external-reference-inputs.json`.
REF-04: somente S2=0,913 a 7,5 m, III/A, com intervalo da última casa publicada; pressões 0,50/0,69 kN/m² documentadas não viraram Cpe.
REF-01: somente exposição S2, preservando V0=45/33 m/s conflitantes. Não foi adotada uma velocidade para certificar ações.
REF-02 não foi utilizada como oráculo 2025. Sem nova validação global de obras ou inspeção em iPhone físico.

A saída WP completa do solver foi congelada **antes** da alteração: `src/domain/test-support/m33a-solver-baseline.json`.
Comando inicial filtrado: `vitest run src/domain/m33a-solver-regression.test.ts`; 1 aprovado com o Python real.
Os casos sintéticos novos percorrem arquivo → seleção → zonas → terças → combinações → solver, em uma e duas águas, verificando reações, momentos e esforços disponíveis.
Testes de desenvolvimento foram filtrados; falhas iniciais de preparação e o fator duplicado não recusado inicialmente foram preservados. A validação passou a recusar domínios de fatores duplicados. Sem skips novos ou relaxamento dos gates/tolerâncias; exclusões nas rodadas filtradas não são skips da suíte final.

Fechamento: resultados, SHA, ambiente e comandos em `validation/m33a/results/checks.json`; agregado em `summary.json`, no mesmo diretório.

| Check local, executado uma vez no fechamento | Resultado |
|---|---|
| TypeScript / ESLint | Aprovados |
| Vitest completo | **421 aprovados / 1 falha / 0 pendentes**, 422 testes, 49 arquivos |
| Novos testes M33-A, incluídos no total | **33 aprovados**, inclusive regressão congelada e duas cadeias com solver real |
| Teste HTTP resistente existente, isolado após falha | **1 aprovado**; outro teste excluído pelo filtro, sem alteração de fonte |
| Núcleo Python | **1.631 aprovados**, zero falhas/erros/skips; **1.000 comparações independentes** |
| CAD/DXF | ezdxf 1.4.5: 130 linhas 3D, mm, zero erros de auditoria |
| Build de produção | Aprovado |

**O fechamento local não está integralmente verde.** O teste HTTP existente de tração NBR14762 retornou 503 após 20,286 s; o reteste isolado passou em 18,83 s totais. Causa da intermitência não estabelecida. Falha e passagem preservadas; nenhum limite/tolerância foi elevado. A suíte completa não foi repetida. Solver/distribuidor/compilador/gate e locks foram preservados, conforme `preservation.json`.
Executar uma vez: `python validation/m33a/run_checks.py` (Python principal já preparado, Node 24, ambientes/locks existentes).
A matriz numérica Linux/Windows e os Playwright ficam para a CI; não são apresentados como nova execução local da M33-A.
Os flags `computedStructuralApproval`, `fabricationRelease`, `approved_for_fabrication` e `normative_second_order_verified` continuam falsos.

## O que falta fornecer para destravar os procedimentos

1. Transcrição revisada das linhas de Cpe/zonas e todos os casos de Cpi do documento já fornecido: item, condições geométricas, inclinação/incidência e hipóteses completas de aberturas, com origem por valor.
2. Transcrição revisada de gamma/psi/receitas da NBR 8681:2025 e seus domínios por finalidade, categoria, papel e efeito; confirmação da cobertura da captura e requisitos não visíveis nela.
3. Texto/escopo da errata 6123:2025 para comparação com a edição original, antes de mudar seu identificador; compatibilidade explícita com prescrições próprias/datadas da 14762.
4. Revisão independente das transcrições e casos normativos externos equivalentes. Os arquivos e seus testes permitem esse próximo passo sem reenviar PDFs ao Git público.

## Continuação — fase 1: estabilização antes da incorporação normativa

Base conferida: `83420da`; run PR `41891925170`: importação JSON sem atributo no Playwright e um timeout cFSM Windows; o push havia passado.
Ambos os imports do catálogo usam agora `with { type: "json" }`, sem duplicação ou mudança dos dados. Coleta Playwright: 73 testes; TypeScript e 9 testes Vitest direcionados aprovados.
O perfil do caminho HTTP identificou custo em integrações FE repetidas e fatorações da mesma matriz para RHS distintos. Cache por coordenadas/quadratura exatas e LU do backend SciPy original, limitado à malha, preserva as verificações nativas. Nenhum resultado de pedido anterior é utilizado.
Montagens locais cFSM com entradas byte a byte idênticas também são reutilizadas na mesma semionda. Permanecem 64 semiondas, todas as malhas, tolerâncias, limites e desligamento da árvore Windows.
Testes: 59 cFSM (incluem 3 de cache) e 11 de seção (incluem os mesmos 3), aprovados; workers cFSM 12,808/12,757 s e HTTP resistente 15,651 s neste ambiente. A melhoria não constitui garantia universal de tempo.
O teste HTTP passa a registrar o corpo de erro em uma falha, para distinguir TIMEOUT/BUSY/MEMORY_LIMIT. CI do SHA de estabilização será conferida antes de iniciar alterações normativas.
Os três novos PDFs foram localizados; nenhum conteúdo normativo foi incorporado nesta fase. Resultados e evidências em `validation/m33a/stabilization/`.
