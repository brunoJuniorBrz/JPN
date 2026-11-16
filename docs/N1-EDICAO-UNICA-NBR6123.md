# N1: edição única da NBR 6123 em todo o vento

Item N1 de `docs/PENDENCIAS-NORMATIVAS.md` (branch `prep/integration-handoff`).
Mantidos: `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

## Fonte consultada

Versão corrigida da ABNT NBR 6123:2023 fornecida pelo usuário, páginas 1 a 48
(SHA-256 `02528d06…7a90`, o mesmo do extrato revisado da cobertura). A folha de rosto
declara que a versão corrigida incorpora a Errata 1, de 08.04.2025. Foram lidos só os
trechos usados pelo código:

| Trecho | Página (doc / PDF) | Resultado |
|---|---|---|
| 5.3.3, fórmula de S2 e mínimo de 10 m na categoria V | 14-15 / 26-27 | igual |
| Tabela 1 (zg, bm, p) e Tabela 2 (Fr) | 15 / 27 | 35 valores iguais |
| Tabela 3 (S2 tabelado) | 16 / 28 | usada como controle independente (13 células) |
| 4.2 (q = 0,613 Vk², ρ = 1,226 kg/m³) | 8 / 20 | igual |
| Tabela 6 (48 Cpe, 6 cpe médio, Notas 1-5) | 20 / 32 | 54 valores iguais |
| 6.3.2.1 a)/b)/c), 6.3.2.2, 6.3.2.3 | 44-45 / 56-57 | valores iguais |

Única diferença de texto: em 6.3.2.1 c), abertura dominante a sotavento, a versão
corrigida remete à **Tabela 6**; a original remetia à "Tabela 4" (S3). Isso confirma a
interpretação que o código já usava. As páginas de 6.3.2 também mudaram em uma unidade
(43 para 44), e o JSON foi atualizado.

## O que mudou no código

- `src/domain/nbr6123-edition.ts`: uma constante de edição (`2023-corrected-2025`),
  errata, SHA e rótulo, e a guarda `assertSingleNbr6123Edition` (`WIND_EDITION_MIXED`).
- Os JSON de velocidade e de paredes passam a declarar a edição corrigida, com registro
  da conferência (`errataCheck`). O SHA da edição original fica como `previousDocumentSha256`.
- A velocidade (`wind-speed/1`) aceita só a edição corrigida e registra `edition` no resultado.
- As linhas Cpe/Cpi aceitam só a edição corrigida (o contrato com duas edições foi removido).
  Em `normative-origin`, a velocidade, a linha, as zonas e os Cpi de cada caso passam pela guarda.
- O escopo revisado de cobertura agora é exigido pelo SHA do documento corrigido, não mais
  pela edição, porque agora toda linha tem a mesma edição.
- As fachadas registram `edition` e citam a versão corrigida em cada zona.
- O aviso PROVISIONAL do vento continua, agora sem o motivo "edição não unificada".
  A licença de publicação das tabelas e a revisão profissional seguem pendentes.

## Decisão para revisão do Tom

1. Como nenhum valor mudou, os números transcritos da edição original foram mantidos e
   passaram a citar a versão corrigida. Cálculos de velocidade e pressão não mudam.
2. Entradas `wind-speed/1` com `edition: "2023-original"` passam a ser recusadas. Quem
   montar a entrada pela interface recebe a edição nova automaticamente.
3. A confirmação explícita `leewardTableReferenceResolved` foi mantida, mesmo com a errata
   resolvendo a remissão, para não alterar o contrato de entrada. Retirá-la fica para outra decisão.
4. A cópia usada não é exemplar certificado (impressão licenciada de terceiros, p.1-48).
   Os flags `currentEditionCorrectionsVerified` e `errataVerified` seguem `false` até a revisão profissional.

## Aceite

`src/domain/nbr6123-edition.test.ts`:
- todos os dados de vento declaram a mesma edição, errata e documento;
- a mistura de edições falha na guarda, na velocidade e nas linhas Cpe/Cpi (zona, Cpi e linha);
- as fachadas registram a edição única;
- o S2 da fórmula confere com 13 células da Tabela 3 da versão corrigida (±0,005).
