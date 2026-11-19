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
