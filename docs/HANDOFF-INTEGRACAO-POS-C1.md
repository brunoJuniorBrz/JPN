# Handoff — integração pós-C1 (preparado em 14/11/2026)

Base: `main` em `55499fc`. Este documento **não muda código**. Ele lista o que já está pronto para integrar, onde cada peça se liga e a ordem que minimiza conflito entre agentes.

Bloqueios mantidos em tudo abaixo: `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. CI verde não é prova de segurança estrutural. Revisão profissional continua obrigatória.

## 0. Antes de tudo: CI da main (escopo da C1)

Na `main` (`55499fc`), o job `application` falha em `validation/integration-general/audit.py` (linha 81):

```
AssertionError: Historical test/evidence drift: src/domain/declared-facade-mixed-real.test.ts
```

Causa: o PR #92 (M54) acrescentou 5 linhas a um teste protegido (blob `68e7233d…` → `a3df8190…`), e o `audit.py` da main não tem mecanismo de emenda revisada. Os PRs #85/#93 tinham esse mecanismo (`REVIEWED_AMENDMENTS`), mas foram feitos sobre uma versão antiga do `audit.py`.

Correção mínima sugerida (decisão e commit ficam com quem fizer a C1):

```python
# Emendas revisadas a arquivos protegidos, fixadas por blob Git.
REVIEWED_AMENDMENTS = {
    # PR #92 (M54): rejeita carga de fachada duplicada sob ID disfarçado.
    "src/domain/declared-facade-mixed-real.test.ts": "a3df819018a8b38e864f72bdda5fd26ba1fa2acd",
}
...
    for path in protected:
        if path == "validation/integration-general/audit.py":
            continue
        assert current.get(path) in (historic[path], REVIEWED_AMENDMENTS.get(path)), "Historical test/evidence drift: " + path
```

Verificado localmente: com a `main` atual, esse é o **único** arquivo protegido divergente, e com o patch acima `python3 validation/integration-general/audit.py` imprime `Integration audit PASS`. O patch não foi commitado em nenhuma branch.

Também falham na `main` desde `13f1769` (#90): `tests/e2e/studio-next.spec.ts:23` (WebGL após remontagens, 1440 px) e, em `a7c28bb`, `tests/e2e/quick-project.spec.ts:5`. Os heads de #88 e #90 estavam verdes isoladamente; a falha surgiu na combinação.

Recomendação de processo: ativar proteção da `main` exigindo `application` e `structural (ubuntu-latest)`.

## 1. Branch pronta: `prep/m41-m42-rebased-on-main`

Conteúdo dos PRs #93 → #94 → #96 → #98 → #99 (7 commits), **rebaseados direto sobre a `main`** e sem os 3 commits do #85, que o #92 substituiu.

| Commit novo | Origem | Assunto |
| --- | --- | --- |
| `1f096fc` | `b4e262b` (#93) | Tabela 6 + Cpi 6.3.2.1 em paredes → solver |
| `28078f2` | `77855db` (#94) | Zonas de paredes paralelas, perfil por trechos |
| `4484fcb` | `25b65a7` (#94) | Documentação de auditoria (alterações no `audit.py` descartadas) |
| `21c1fa7` | `8fd127c` (#96) | Tabela 6 conferida célula a célula |
| `3036da2` | `17bb7c5` (#96) | Notas da Tabela 6 e Cpi 6.3.2 |
| `be331bb` | `e6e4bc8` (#98) | Cpi detalhado 6.3.3, sotavento, Detalhe I |
| `1e8cecf` | `f19680a` (#99) | Combinações NBR 8681:2025 |

Resolução de conflitos: só `validation/integration-general/audit.py` e `pr-matrix.json` conflitaram. Em todos os commits fiquei com a versão da `main`, porque o `audit.py` da main compara contra o `INTEGRATED_SHA` congelado (#84) e a matriz não deve mudar. Nenhum arquivo de `src/` ou `engine/` precisou de resolução manual.

Verificação local (Linux, Node 22, Python 3.12.3, PyNiteFEA 3.2.1, numpy 2.5.4, scipy 1.18.1):

- `tsc --noEmit`: OK.
- `eslint` nos arquivos alterados: OK.
- 12 arquivos de teste de vento, fachada e combinações, incluindo PyNite real: 92 de 92 passaram.
- Suíte completa do Vitest: 88 de 95 arquivos passaram. Os 7 que falharam (`runner`, `spatial-analysis`, `m50-assessment-real`, `elastic-ltb`, `local-section-real`, `local-design-real`, `local-buckling-real`) falham **igualmente na `main` limpa** no mesmo ambiente; dependem dos perfis numéricos opcionais da CI. Não são regressão da pilha.
- `audit.py`: falha com o mesmo erro da `main` (seção 0). Corrigido pela C1, esta branch fica limpa.

O que a branch **não** faz: não é PR, não foi mesclada, não toca a branch do Codex (#95, `codex/m41-facade-mechanical-verification`). O #95 parte do #94 antigo; ao rebasear, use `git rebase --onto prep/m41-m42-rebased-on-main 8fd127c^ codex/m41-facade-mechanical-verification` ou reaplique `e5300f6` e `2e49f2b` com cherry-pick.

Depois disso, os PRs #85, #93, #94, #96, #98 e #99 podem ser fechados como substituídos por um único PR desta branch, se o dono aprovar.

## 2. Mapa de integração: o que existe e onde ligar

Fluxo atual da UI (`src/components/planning/mixed-analysis-workspace.tsx`, função `execute`, linha 94):

```
adaptLoadedMixedProject(active)          // loaded-mixed-adapter.ts
  → POST /api/experimental/mixed3d       // local (pnpm dev:structural) ou remoto (JPN_MIXED_REMOTE_ENABLED=1)
  → verifyMixedResult / verifyLoadingTrace
  → buildResistanceReport(...)           // resistance-report.ts
  → buildConnectionReport(...)           // opcional, X-JPN-Joint-Actions: 1
  → ResistanceReportPanel → ColdformedDesignControl → POST /api/experimental/design (só localhost)
```

| Peça | Estado | Ponto de ligação | Sem UI hoje? |
| --- | --- | --- | --- |
| Fachadas físicas (`physicalFacades`) | Schema em `spatial-preparation.ts:58`, auditoria `physical-facade-envelope.ts` | Precisa de editor ou de campo em `physical-model-import.ts` (hoje 0 menções a fachada) | **Sim**: só exemplos e testes criam fachadas |
| Tração de fachada declarada (`loading.facadeTraction`) | `declared-facade-traction.ts`, consumido em `loaded-mixed-adapter.ts:25–33` | Editor em `structural-loads-panel.tsx` | **Sim** |
| Vento normativo em paredes (`buildNormativeFacadeTraction`) | Branch da seção 1, `wind-facade-normative.ts:216` | Gera `facadeTraction` a partir da obra; botão no mesmo editor acima | **Sim** |
| Velocidade/pressão S1·S2·Vk·q | main, `wind-speed.ts` | Já ligado: `wind-speed-control.tsx` | Não |
| Zonas de vento da cobertura (declaradas) | main, `wind-load-path.ts` | Já ligado: `wind-engineering-panel.tsx` | Não |
| Cpe de cobertura do extrato revisado | main, `reviewed-roof-catalog.ts` + `normative-origin.ts` | Sem consumidor na UI | **Sim** |
| Combinações declaradas | main, `apply-engineering-combinations.ts` | Já ligado: `engineering-combinations-control.tsx` | Não |
| Gerador NBR 8681 (`applyNbr8681Combinations(project, raw)`) | Branch da seção 1, `nbr8681-combinations.ts:180` | Botão "gerar pela NBR 8681" em `engineering-combinations-control.tsx`, mesmo `onChange({workspace})` | **Sim** |
| Avaliação M50 / FLT M51 | main, `structural-assessment.ts`, rota `/api/experimental/structural-assessment` | Chamar após `buildResistanceReport` no `execute`; E2E atual usa `page.request` | **Sim** |
| Segunda ordem (P2–P7) | main, clientes `second-order-frame-client.ts`, `p4-frame-client.ts`, `corotational-frame-client.ts` | 0 importadores; aguardar M43-P8 | **Sim** |
| Parafuso/solda NBR 14762 | `engine/jpn_structural/single_bolt_14762.py`, `flat_fillet_weld_14762.py` | Sem chamada pela análise mista | **Sim** |

Rotas que só funcionam em `localhost` (`local-numerical-http.ts`): `design`, `section`, `structural-assessment`. Rota sem caminho remoto: `second-order-frame`. O backend remoto (`engine/app.py`) só expõe `analyze-mixed` e `analyze-purlin`.

## 3. Contratos que travam a integração (decidir antes de ligar)

1. **Limite de 10.** `engineering-combinations.ts` linhas 16, 23, 24 e `spatial-analysis.ts` usam `.max(10)` para ações e combinações; `declared-facade-traction-contract.ts:17` também. Um galpão de duas águas com vento 0°/90°, Cpi ± e G/Q passa disso. O #99 documenta o limite e sugere "dividir por famílias", o que quebra a envoltória única. Proposta: limite derivado do orçamento de execução (tamanho do request e tempo), com o mesmo `input_sha256` cobrindo todas as combinações.
2. **Superposição × segunda ordem.** `engine/jpn_structural/mixed3d.py` monta combinações por fatores sobre casos (linhas 186, 268, 312). Correto em análise linear. Quando a M43 entrar, cada combinação precisa ser resolvida separadamente. O contrato do request deve permitir os dois modos sem trocar o formato do resultado.
3. **Fonte normativa única.** A `main` lê fatores NBR 8681 e Cpe de cobertura de um extrato privado validado por SHA (`reviewed-roof-catalog.ts`, `combinationsDocumentSha256`). O #99 cria `data/normas/nbr8681-2025-combinations.json` público. Escolher um e fazer o outro derivar dele.
4. **Edição da NBR 6123.** `nbr6123-2023-speed.json` e `nbr6123-2023-wall-cpe.json` dizem `2023-original`; `reviewed-roof-catalog.ts` diz `2023-corrected-2025`. Uma análise não deve misturar edições; o resultado deve registrar a edição usada.
5. **Publicação de tabelas.** O repositório é público. `reviewed-roof-catalog.ts` afirma que o extrato pertence a configuração privada licenciada; os JSON da seção 1 publicam tabelas. Decisão do dono do projeto, antes do merge.

## 4. Ordem sugerida (sem sobreposição)

1. C1 (Codex): CI da `main` verde e protegida (seção 0).
2. Abrir um PR único de `prep/m41-m42-rebased-on-main`; rodar CI; fechar #85/#93/#94/#96/#98/#99 como substituídos.
3. Decidir os contratos 1–5 (seção 3) por escrito.
4. Codex: editores de fachada e de tração na UI; ligar `buildNormativeFacadeTraction` e `applyNbr8681Combinations`; chamar `structural-assessment` no `execute`; E2E pela interface, sem `page.request`.
5. Claude Code (NBRs): unificar edição da NBR 6123; Cpe de cobertura nas inclinações correntes; fonte única da NBR 8681.
6. Fatia vertical revisável (MVP-1) e dois casos de referência independentes antes de qualquer projeto real.

Faixas de arquivo para evitar conflito: somente quem integra edita `validation/integration-general/*`, `src/app/api/*`, `src/infrastructure/analysis/*` e `src/components/planning/*`. Quem implementa norma edita `src/domain/wind-*`, `src/domain/nbr*`, `src/domain/*normative*` e `data/normas/*`.

## 5. PRs abertos já contidos na main

Inteiramente ancestrais da `main` (`git merge-base --is-ancestor`), podem ser fechados apontando o merge #75/#84: #56, #58, #59, #61, #64, #67, #68, #69, #71, #72, #73, #74, #77, #78, #79, #80, #81, #82, #83. O #79 tem o mesmo head (`2b009d2`) do #75.

Com commits fora da main, mas já classificados como equivalentes em `audit.py` (`NOTES`): #54, #55, #57, #62, #63, #65, #66, #70, #76.

## 6. Pendências registradas (14/11/2026, 15h40)

- **C1 é correção física, não da CI.** `fix/c1-z-up-local-axes-mixed3d-v3` (`2f21553`): o PyNite 3.2.1 monta eixos locais para Y vertical; o JPN usa Z. No contrato `/2`, barras inclinadas fora do plano XZ ou em diagonal na planta podem ser analisadas no eixo fraco (ex. da própria C1: −8,52 mm contra −1,07 mm da solução fechada). Sem conflito com a `main` atual nem com `prep/m41-m42-rebased-on-main`. Sem PR aberto. CI: 2 testes recusados de propósito (`continuous-demands`, `whole-piece-deflection`).
- **C2** (`fix/c2-secondary-fixity-stability-audit`, `dc33aa3`): CI verde, base antiga (`1a7002b`), merge limpo com a `main`, sem PR.
- **UI ainda emite `/1` e `/2`.** Após a C1, análises com barras ambíguas serão recusadas até a UI emitir `/3`. A condição "após merge da M50" do doc da C1 já foi cumprida (#87).
- **Reexecutar #101, #102 e #103 depois de C1 + `/3`.** O teste real NBR 6120 → 8681 → PyNite → NBR 8800 do #103 (`7eeda56`) rodou pelo contrato `/2`. A matriz peça × combinação precisa ser recalculada com `/3` antes de servir de referência.
- **Pilha #101 → #102 → #103 ainda empilhada sobre #99.** Rebase sobre `prep/m41-m42-rebased-on-main` pendente; conflito esperado só em `validation/integration-general/audit.py` (emendas revisadas do M44-P1 em `477462c` precisam ser portadas para o `audit.py` da `main`, não descartadas).
- **CI da `main`** continua vermelha até o patch da seção 0.
- **19 PRs contidos na `main`** (seção 5) continuam abertos.
