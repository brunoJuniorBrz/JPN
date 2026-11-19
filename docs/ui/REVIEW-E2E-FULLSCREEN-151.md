# Revisão dos seletores E2E do Studio 3D — pós-#150 e #151

## Motivo

O PR #150 moveu a ação de tela cheia para uma faixa própria acima do canvas, e o cabeçalho expandido passou a fornecer a ação `Fechar tela cheia`. O teste histórico `tests/e2e/profiles-3d.spec.ts` ainda procurava `Tela cheia` e `Sair da tela cheia`, nomes que já não correspondem à interface acessível. A CI do #150 e do #151 registrava dois timeouts por esse motivo.

O painel Studio também passou a ter rolagem própria. A suposição histórica de que `Medir entre nós` deveria estar imediatamente no viewport falhava no E2E em 1440px.

## Mudanças verificadas

- `tests/e2e/profiles-3d.spec.ts`: seletores adaptados para `Expandir modelo 3D em tela cheia` e `Fechar tela cheia`. As verificações de canvas persistente, expansão, modos, perfis 3D, seleção e dados preservados não foram removidas.
- `tests/e2e/studio-3d-layout.spec.ts`: mantém a exigência de botão visível e clicável, porém usa `scrollIntoViewIfNeeded()` para acesso na área rolável, e verifica abertura e encerramento efetivos da medição. Este arquivo foi criado depois do snapshot histórico de PR84; não está no conjunto congelado.
- O blob Git de `profiles-3d.spec.ts` mudou do SHA revisado `51a16f83c93441385db33db21e81f5dc639506e4` para `86ca2f3969cfc88bdd656fdd8c7164dc16e789a6`. `validation/integration-general/audit.py` reconhece **exatamente** o novo blob após esta revisão. Nenhum coringa, exceção de diretório ou exclusão de guardas foi introduzido.

## Limites

- Esta revisão não significa aprovação da alteração do motor numérico.
- Os bloqueios `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` não foram modificados.
- A CI completa e os E2Es continuam obrigatórios antes de liberar a produção.

## Revisão adicional — intercepção de clique e timeout no runner

- A execução `44546516292` passou na auditoria histórica, nos testes unitários, no TypeScript, no lint e nas validações numéricas, mas falhou em 2/134 E2E.
- `tesoura-substituir.spec.ts`: ao navegar pelo Studio estreito em viewport desktop, o CSS em `truss-editor.module.css` posicionava o canvas em `sticky` mesmo quando o grid tinha só uma coluna. Ao rolar até **Aplicar na obra e atualizar o 3D**, o SVG/painel de tipos interceptava eventos do botão. Agora o editor usa `container-type:inline-size` e desativa o sticky quando a largura real do componente é de até 897 px, preservando sticky somente no layout de duas colunas.
- `profiles-3d.spec.ts`: o caso desktop de 1440 px atingiu 30 s sem falha de asserção identificada. Aumentou-se para 90 s **somente esse caso** para não falsear o teste de raycasting WebGL no runner; nenhuma validação, verificação de estado, clique ou retorno foi removido.
- O novo blob auditado do teste congelado é `9cbfae46ab36298c65ffcd935b04e344e5f4b519` (substitui `86ca2f3969cfc88bdd656fdd8c7164dc16e789a6`). Registro explícito em `validation/integration-general/audit.py`, sem exceções gerais nem desativação da auditoria.
- **Aceite pendente:** CI integral verde no SHA final, incluindo o E2E de substituição sobre pilares, o desktop 3D e o build; a alteração de timeout não equivale a comprovação de desempenho.

## Evidência nova: rastreamento Playwright da segunda falha (#154)

- CI: https://github.com/brunoJuniorBrz/JPN/actions/runs/44566697492 — 133 de 134 E2E passaram; o caso `profiles-3d.spec.ts` em 1440px ainda falhou após 90 segundos.
- Artefato `general-integration-browser-evidence` ID `14556016853`, `trace.zip`: o **clique em `Fechar tela cheia`** ficou pendente, porque o `<canvas role="img">` da `.presentation-viewport` interceptou o ponto central do botão repetidamente. **Não era lentidão do raycasting nem dos cálculos**.
- Correção de produção: `.structure-viewer-heading` agora estabelece camada relativa `z-index:6` acima do canvas e não encolhe no contêiner flex; sem desabilitar eventos do 3D.
- Novo teste dedicado em `tests/e2e/studio-3d-layout.spec.ts` verifica `document.elementFromPoint` sobre o centro do botão e exige clique de Playwright seguido do fechamento real, com o canvas ainda visível.
- A ampliação de timeout anterior permanece como margem para o runner, mas **não deve ser considerada a correção** do problema; somente a CI integral verde da nova revisão validará o ajuste.
