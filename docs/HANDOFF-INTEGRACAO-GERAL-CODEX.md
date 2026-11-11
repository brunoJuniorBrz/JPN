# Handoff — integração geral JPN — próximo Codex

**Registro: 11/11/2026, 20:24 UTC. Trabalho interrompido a pedido do proprietário
por limite de créditos. A missão NÃO está declarada concluída: falta fechar a CI.**

- Repositório: `brunoJuniorBrz/JPN`.
- Branch: `integration/jpn-general-candidate`.
- PR draft contra main: https://github.com/brunoJuniorBrz/JPN/pull/84
- Main de partida, preservada: `cc516b6f5cc97750de5aecf7564fcaff47a1d4f3`.
- Último commit de implementação anterior a este handoff:
  `c17d75ba86900dd6d41d364d8fd46ded722dbaf8`.
- Este handoff é apenas documentação; seu commit produzirá um novo SHA/CI.
- **Não fazer merge na main nem deploy sem autorização expressa.**

## O que já está integrado e publicado

1. Merge da #83 (`b228070`), preservando os 156 commits exclusivos da cadeia
   M35–M43 e as funcionalidades anteriores da main.
2. #51: dados históricos UFSC, validador e lacunas documentadas; não são um
   modelo FE exato nem fatores normativos produtivos.
3. #42/#45: pesquisa Kg e registros históricos preservados separadamente.
4. #21: biblioteca/componente/testes SCI preservados **sem ativar na UI**;
   revisão profissional pendente no documento original.
5. #39/#40: documentos históricos recuperados; UI já adaptada preservada.
   Demais PRs equivalentes não receberam merges duplicados.

Há 64 PRs no snapshot, 1.563 registros de arquivos, grafo real e matriz completa:

- `docs/INTEGRACAO-GERAL-CANDIDATA.md`: decisões, conflito e recursos acessíveis.
- `validation/integration-general/PRS.md`: índice humano dos 64 PRs.
- `validation/integration-general/pr-matrix.json`: arquivos, blobs, SHAs e testes.
- `validation/integration-general/pr-snapshot.json`: inventário original congelado.
- `validation/integration-general/ancestry-graph.mmd`: ancestralidade real, sem
  confundir adaptações/cherry-picks com merges.
- `validation/integration-general/audit.py`: auditor executado também na CI.

O único conflito de conteúdo foi na #21, em dois trechos do cadastro rápido.
O formulário resultante é idêntico à #83; não se substituiu a UI atual pelo
cartão SCI não revisado. Nenhum arquivo numérico existente foi alterado.

## Verificação já comprovada — não repetir sem necessidade

- **2 novos Playwright reais passaram**, em 390 e 1440 px:
  `tests/e2e/general-integration.spec.ts`.
- Fluxo: importar/cadastrar obra → inserir pano XYZ e pressão pela UI → conferir
  conectividade → salvar/reabrir → HTTP real → PyNite 3.2.1 → relatório exportado.
- Seis nós/seis barras, quatro apoios, quatro cargas distribuídas e nenhuma carga
  nodal de conveniência. Reações = **4000 N**. Flecha = **−0,003255208333 m**,
  conferida por `−q L^4/(384 EI)`. Duplicar Iy invalida hash/resultado e gera
  **−0,001627604167 m**. Fabricação continua bloqueada.
- Conferidos os dois payloads: todas as coordenadas SI, extremidades, DOFs,
  barras carregadas e E/A/Iy correspondem à declaração original.
- **20 testes SCI**, **6 ensaios Kg**, QA UFSC e typecheck passaram localmente.
- Auditoria dos 64 PRs passou após trocar hashes do checkout por **blobs Git
  imutáveis**, evitando diferenças CRLF/LF entre Windows e Linux.
- A base #83 já possui evidência completa válida em `b228070`:
  https://github.com/brunoJuniorBrz/JPN/actions/runs/43081350381
  https://github.com/brunoJuniorBrz/JPN/actions/runs/43081363434
  Suas fontes, contratos, testes, golden files e evidências foram preservados.

## Estado real da CI no instante do handoff

Execuções do SHA `c17d75b`:

- Push: https://github.com/brunoJuniorBrz/JPN/actions/runs/43094612874
  — **8/11 jobs concluídos com sucesso**; aplicação em Playwright; dois jobs
  Windows já estavam na publicação dos artefatos.
- PR: https://github.com/brunoJuniorBrz/JPN/actions/runs/43094620869
  — **6/11 concluídos com sucesso**; aplicação em Playwright; outros jobs
  concluindo/publicando artefatos. Nenhuma etapa tinha falha reportada.

Typecheck, lint, auditoria e Vitest da aplicação alcançaram a etapa seguinte.
Conferir os números nos logs finais; a expectativa pelo inventário é 720 Vitest
e 109 Playwright. A suíte estrutural e as referências são executadas nos dois
sistemas. Uploads de artefatos aparentavam demora: conferir o resultado real
antes de atribuir falha ao código. Não ampliar timeouts para mascarar problemas.

As execuções antigas `43093709871` / `43093880207`, no SHA `df77838`, falharam no
auditor por diferenças de CRLF/LF. Esse problema foi corrigido em `c17d75b`.
Não voltar à comparação dos bytes do checkout nem confundir essas execuções
antigas com a validação do HEAD atual.

## Trabalho restante, em ordem

1. Fazer fetch e confirmar o HEAD atual da candidata, main e PR #84; preservar
   este handoff. Ler AGENTS.md antes de eventual alteração de código.
2. Localizar as execuções do **novo SHA que inclui este documento**, monitorar
   todos os jobs e baixar logs somente quando disponíveis.
3. Se houver falha real, corrigir a causa com escopo mínimo. Não refatorar motores,
   afrouxar testes, mexer em coeficientes ou retirar evidências.
4. Confirmar toda a CI no SHA final: typecheck/lint, Vitest, Pytest/dependências
   reais, referências P2–P5 Linux/Windows, perfis opcionais, QA UFSC, Kg, DXF,
   PDF/Excel e demais exportações existentes, Playwright desktop/mobile e build.
5. Conferir o artefato `general-integration-browser-evidence`: os dois JSONs e
   screenshots da jornada ficam em `.tools/integration-general-runtime/` durante
   o teste e são publicados pela CI. Tudo necessário para reprodução está no Git.
6. Atualizar o **corpo do PR #84** com SHA final, links e resultados reais, sem
   criar outro commit apenas para registrar CI (isso dispararia nova rodada).
7. Entregar relatório curto ao proprietário, distinguindo integração funcional
   de homologação estrutural. Não declarar conclusão com CI/testes pendentes.

## Restrições que continuam válidas

- `computedStructuralApproval=false`, `fabricationRelease=false`,
  `NOT_READY_BLOCKED`; nenhum P-Delta experimental substitui a solução linear.
- M43 permanece parcial: P5 tem um benchmark de coluna verificado e três casos
  espaciais pendentes. Resistência completa, apoios e homologação normativa
  continuam fora do domínio aprovado.
- SCI permanece inativo; dados UFSC são históricos e incompletos para modelo FE.
- Deploy de `main` e `integration/jpn-general-candidate` está desabilitado nos dois
  `vercel.json`. Não fazer merge/deploy, fechar PRs ou ativar funções sem autorização.
- Não regravar automaticamente a matriz. A CI usa `audit.py` sem `--record`.

Reprodução do auditor: `python validation/integration-general/audit.py`, com
histórico Git completo. No Windows, definir `JPN_GIT_EXECUTABLE` se Git não estiver
no PATH. Diretório usado nesta máquina: `C:\Users\Usuario\Desktop\jpn-integracao-geral`;
o próximo Codex pode usar outro checkout da mesma branch.
