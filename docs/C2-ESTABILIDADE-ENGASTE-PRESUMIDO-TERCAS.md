# C2 — Estabilidade que depende do engaste presumido de terças

Origem: auditoria independente de 12/11/2026 sobre a `main` em `1a7002b`.

## Problema

O detector de mecanismo do motor misto só enxerga a rigidez montada. Quando o
grupo de terças fica com ligação "rígida" e nenhuma peça recebe declaração
própria, o adaptador transmite continuidade de flexão em todas as terças. Um
galpão sem contraventamento longitudinal passa a ser estável só por isso, com
equilíbrio perfeito e resultado fisicamente enganoso.

Caso de referência (dois pórticos 6 × 4 m, afastados 5 m, bases rotuladas, 2 × 1 kN
longitudinais nos beirais): o motor aceita o modelo e cada extremidade de terça
carrega 2,0 kN·m. Com a flexão das terças liberada, o mesmo motor recusa com `UNSTABLE`.

## Correção

`src/domain/secondary-fixity.ts` (arquivo novo; nenhum módulo existente foi alterado):

- `presumedSecondaryFixity`: lista as extremidades de peças de papel `purlin`,
  modeladas como pórtico, cuja continuidade de flexão foi **herdada do grupo**.
- `secondaryFixityCounterfactual`: devolve a mesma entrada do solver com a flexão
  liberada apenas nessas extremidades. Torção, apoios, cargas, seções e demais
  barras ficam idênticos.
- `assessSecondaryFixity`: interpreta a resposta do solver ao contrafactual.
  `UNSTABLE` → `STABILITY_DEPENDS_ON_SECONDARY_FIXITY`; `ILL_CONDITIONED` ou
  `MODEL_LIMIT` → `STIFFNESS_DEPENDS_ON_SECONDARY_FIXITY`; qualquer outra recusa →
  `SECONDARY_FIXITY_AUDIT_INCONCLUSIVE`. Auditoria pendente lança erro; nunca é lida como aprovação.

Regras preservadas:

- Terça não é tratada como contraventamento nem como ligação rígida por herança.
- Ligação declarada **peça por peça** em `memberConnections` (valor diferente de
  `inherit`) é uma declaração física explícita e não é liberada nem bloqueada.
- Nenhuma rigidez, apoio ou tolerância foi criado ou alterado; a decisão é do
  portão de mecanismo, condicionamento e domínio linear já existente.
- `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` em todas as saídas.

## Limites desta entrega

- **Não está ligada ao fluxo de cálculo da interface nem às rotas HTTP.** A
  auditoria existe como função de domínio testada; quem chama o solver ainda
  precisa executar o contrafactual e aplicar o veredito. A ligação foi adiada
  para não colidir com a M50, que edita `mixed-adapter.ts`, `spatial-preparation.ts`
  e os executores numéricos.
- Não existe campo de justificativa por ligação. "Declarada peça por peça" é o
  critério disponível hoje; um campo de base física exige alterar o esquema de preparação.
- Só o papel `purlin` é tratado como secundário.
- Não verifica a capacidade da ligação declarada nem o contraventamento; apenas
  impede que a estabilidade venha de uma hipótese não declarada.

## Testes

- `src/domain/secondary-fixity-real.test.ts`: adaptador real → Python 3.12 / PyNite
  3.2.1 real. Instável bloqueado, contraventado estável (força da diagonal
  `1 kN·√41/5`), ligação explícita preservada, galpão com rótulas reais recusado
  pelo próprio motor, garagem M49 sem nada presumido.
- `engine/tests/test_secondary_fixity.py`: mesma física direto no motor.
