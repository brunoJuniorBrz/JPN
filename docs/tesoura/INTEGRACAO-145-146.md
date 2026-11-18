# Integração do editor de tesouras #145 + correções #146

**Data:** 2026-11-18. **Natureza:** geometria declarada, estimativa comercial e interface, não aprovação estrutural.

## Rastreabilidade

- PR #145 (`feat/tesoura-duas-aguas-studio-unificado`): Studio F0–F6, uma/duas águas simétricas, 3D, CAD, quantitativos e preços por água.
- PR #146 (`integration/tesoura-obra-sem-145`): fluxo de obra, ocultação da barra global, retorno aos projetos, recolhimento do trilho, bloqueios de deploy e E2E.
- Branch de conciliação: `integration/tesoura-145-146-conciliada`; merge com ambos os pais, sem alterar a main até passar a CI.

## Política de novas obras e exemplos

- O editor de entrada inicia com `blankTruss()`, 6 × 8 m e preços nulos. **Tom 8 × 10 m é somente exemplo** selecionado manualmente.
- `trussDefaultsFor(project)` lê a geometria real da cobertura e a tipologia explicitamente declarada; não copia os preços do exemplo.
- `provisionalTrussCount` utiliza comprimento da obra e comprimento comercial disponível (com acabamento de 5 mm nas extremidades) para montar um arranjo *geométrico e de corte*. NÃO significa que essa distância entre tesouras é segura, não cria apoios resistentes e não substitui cálculo de terças.
- `geometricPurlinLines` apenas distribui linhas segundo o passo **informado**, no semivão declarado. Deslocamentos para nós são avisados. A verificação da telha, terça e ligações continua PENDENTE.
- Se o trecho da terça entre tesouras exceder a barra comercial, a aplicação é bloqueada com mensagem para declarar mais tesouras **ou detalhar emenda**. Nenhuma emenda é criada automaticamente: não existe uma ligação validada.
- O editor atualiza número geométrico de tesouras ao modificar comprimento e número de linhas de terça ao modificar vão/tipo/passo. Todos permanecem editáveis e sujeitos a revisão do profissional.

## Conflitos de UI

- O layout do #145 é a fonte da composição Studio, com as etapas originais substituídas por F0–F6.
- A ocultação da barra global e o botão de voltar do #146 foram portados para o AppShell do #145, **preservando o ThemeToggle**.
- O E2E antigo do #146 usava elementos artificiais do Studio; agora usa navegação real e alternância de trilho. O E2E da aba antiga foi adaptado às etapas reais.

## Testes / critérios de aceite

- `src/domain/truss-editor.test.ts`: regressão 8 × 10, novas obras 6 × 8, 8 × 10 e 12 × 20, duas águas simétricas, preços desconhecidos, vínculos pendentes e bloqueio de terça maior que a barra.
- `tests/e2e/tesoura-studio-duas-aguas.spec.ts`: fluxo real de nova obra 12 × 20 em duas águas até o Studio; modelo e selo de bloqueio.
- `tests/e2e/studio-workspace-layout.spec.ts`: barra global escondida apenas no workspace, retorno aos projetos e trilho recolhível.
- `tests/e2e/tesoura-workflow.spec.ts`: exemplo do Tom, quantitativos e exportação preliminar pelo menu Arquivos.

## Limites e gates

Todos os modelos continuam com `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED`. Não há inferência de E/G/I/J, vínculos, cargas, coeficientes normativos, resistência, soldas ou parafusos. O CAD e orçamento são documentos preliminares. **Sem compra, corte, fabricação ou uso executivo sem validação técnica independente.**

A CI completa do SHA final, incluindo navegador, TypeScript, lint e testes de engenharia, deve estar verde e auditada antes de qualquer merge na `main`. Os preços ausentes continuam pendentes. O deploy automático permanece bloqueado.
