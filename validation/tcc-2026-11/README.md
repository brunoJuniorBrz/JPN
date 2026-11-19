# TCCs públicos — referências externas para comparar o JPN (nov/2026)

Quatro trabalhos públicos de galpão/cobertura metálica, escolhidos por trazerem
dados de entrada e resultados suficientes para comparação parcial. Nenhum traz
100% do projeto em texto: perfis por barra, Cpe e diagramas costumam estar em
figuras/anexos.

| ID | Fonte | Para que serve |
|---|---|---|
| TCC-01 | UFMG, Oliveira 2015 — galpão do manual CBCA 15×54×6 m, 10°, pórticos a 6 m, em PFF | vento (S2, q), terças, deslocamentos, aproveitamentos |
| TCC-02 | UTFPR, Seguchi 2017 — tesoura de 10 m, 10%, 19 barras | esforço barra a barra e peso da tesoura |
| TCC-03 | Doctum — treliça triangular/arco em U simples, vãos 10–45 m | consumo de aço por vão (mesmo tipo de perfil do Tom) |
| TCC-04 | PUCRS, Lima 2024 — Pratt/Howe/Warren 25 m, NBR 6123:2023 | coerência Vk/q, peso total por tipologia |

Já existente: `docs/validation/mission31/external-reference-inputs.json`
(REF-04 UFMG/Santana 2025, S2) e `validation/ufsc-2023`.

## Estado da transcrição

`reviewStatus: pending-pdf-check`. Valores extraídos do texto dos PDFs por
leitura automática, **sem conferência página a página** e com `pages: null`.
Antes de transformar qualquer número em gabarito bloqueante de dimensionamento,
abrir o PDF, conferir e preencher a página. Não reconstruir conectividade de
treliça a partir da numeração das barras sem a figura original.

## Teste executável

`src/domain/wind-tcc-2026-references.test.ts` (roda na suíte normal `pnpm test`):

- TCC-01: o S2 do JPN (NBR 6123:2023 corrigida) para categoria III/classe C
  dá 0,8158 a 5 m e 0,8835 a 10 m; publicados 0,82 e 0,88 (NBR 6123:1988) —
  dentro do arredondamento. q do JPN 589,1 Pa e 690,9 Pa contra 595 e 685
  publicados: a diferença (~1%) é toda do S2 arredondado a duas casas.
- TCC-04: Vk e q publicados são coerentes com os fatores impressos.
- TCC-03: o q impresso (0,31 kN/m²) **não** sai dos fatores impressos (dá
  0,327) — a inconsistência fica registrada, não certificada.
- Integridade: bloqueios mantidos, 19 barras no TCC-02, simetria de pares e
  tesoura escolhida = mais leve.

## Próximo passo

1. Conferir no PDF a figura de numeração das barras do TCC-02 e as cargas
   nodais; com isso montar `tests/validation/cases/tcc02-tesoura-10m.case.json`
   (formato `jpn.validation-case/1`) com esforços por barra como esperados.
2. Conferir no PDF a lista de perfis do TCC-03 (vão de 10 m) e comparar o
   quantitativo do JPN em kg (meta < 3%).

Sucesso numérico não concede revisão profissional: `NOT_READY_BLOCKED`,
`computedStructuralApproval=false` e `fabricationRelease=false` permanecem.

## TCC-05 — UFCG 2021: Pratt, Howe e Warren (adicionado 19/11/2026)

Vãos 10–25 m, 10%, 0,6 m no apoio, tesouras a cada 3 m, perfis U.

**Esforços — `python3 validation/tcc-2026-11/truss_types_oracle.py`.** As três
tesouras são geradas pelo editor do JPN (`ufcg-jpn-editor-geometry.json`, painéis
de 1,0/1,25/1,67/2,5 m), analisadas pelo solver `jpn.truss/1` e comparadas com um
oráculo independente de equilíbrio nodal (A·N = −F, sem rigidez). São 24 casos
(gravidade com carga montada a partir dos dados do TCC + lateral). A pior diferença
relativa foi 1,3e−13. Pratt tem diagonais tracionadas e Howe comprimidas, como
esperado. O script falha se a diferença passar de 1e−9.

**Peso por tesoura (vão 10 m).** A Pratt com painel de 1 m dá 125,5 kg no JPN
contra 126,25 kg publicados (−0,6%). Howe e Warren não fecham em nenhum painel
testado; a geometria do TCC só existe na figura e precisa ser conferida.

**Limitações do editor encontradas.**
1. ~~Um único perfil para banzo superior e inferior.~~ **Resolvido**: campo
   `bottomChord` (null = igual ao superior), por obra e por tipo de tesoura, em
   muro ou pilar. A Pratt do TCC agora fecha em −0,6%; com perfil único o erro
   seria +10,6% ou −11,8% (`src/domain/truss-bottom-chord.test.ts`).
2. O editor sempre gera montante em todos os nós, então não há como fazer uma
   Warren sem montantes.
