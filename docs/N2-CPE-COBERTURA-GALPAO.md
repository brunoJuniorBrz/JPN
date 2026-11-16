# N2: Cpe de cobertura para galpão (10° e 15°)

Item N2 de `docs/PENDENCIAS-NORMATIVAS.md`. Construído sobre o N1 (edição única da NBR 6123).
Mantidos: `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

## Fonte consultada

Versão corrigida da NBR 6123:2023 (Errata 1:2025), cópia de 48 páginas do usuário (SHA `02528d06…7a90`):
- Tabela 7, duas águas (doc p.21, PDF p.33): linhas θ = 10° e 15°, nas três faixas de altura relativa;
- Tabela 8, uma água, h/b < 2 (doc p.22, PDF p.34): linhas θ = 10° e 15°, colunas 90° e −90°.

Cada célula foi lida duas vezes, na imagem da página e na camada de texto do PDF. As duas leituras coincidem.

| Tabela 7 | EFI (α=90°) | GHJ (α=90°) | EG (α=0°) | FH (α=0°) |
|---|---|---|---|---|
| 10°, h/b ≤ 1/2 | −1,2 | −0,4 | −0,8 | −0,6 |
| 10°, 1/2 < h/b ≤ 3/2 | −1,1 | −0,6 | −0,8 | −0,6 |
| 10°, 3/2 < h/b ≤ 6 | −0,8 | −0,6 | −0,8 | −0,8 |
| 15°, h/b ≤ 1/2 | −1,0 | −0,4 | −0,8 | −0,6 |
| 15°, 1/2 < h/b ≤ 3/2 | −1,0 | −0,6 | −0,8 | −0,6 |
| 15°, 3/2 < h/b ≤ 6 | −0,8 | −0,6 | −0,8 | −0,8 |

| Tabela 8 | H e I (90°) | L e J (90°) | H e I (−90°) | L e J (−90°) |
|---|---|---|---|---|
| 10° | −1,0 | −0,5 | −0,4 | −1,0 |
| 15° | −0,9 | −0,5 | −0,3 | −1,0 |

## O que mudou

- `reviewed-roof-catalog.ts`: o extrato privado do responsável aceita, opcionalmente, `gable10`,
  `gable15` (cada um com as três faixas de h/b), `mono10` e `mono15`. O domínio revisado passa a
  aceitar duas águas a 10°, 15° e 45°, e uma água a 10°, 15° e 30°.
- A faixa de h/b é escolhida pela altura do beiral (Detalhe I). Os limites 1/2 e 3/2 ficam na faixa de baixo, como na tabela.
- As zonas são as mesmas do caminho de 45°: E/G numa faixa x = máx(b/3, a/4) ≤ 2h a partir da borda
  de barlavento, e F-I/H-J no restante. Com planta quadrada, a Nota 3 dá I = F e J = H.
- Se o extrato não tiver a linha pedida, a análise é bloqueada com `REVIEWED_ROOF_EXTRACT_ROW_MISSING`, sem valor substituto.

Os valores continuam no extrato privado, fora do Git, como no caminho de 45°/30°. As células
acima ficam só no teste, como valores esperados.

## Decisões para revisão do Tom

1. **Interpolação em θ:** as Tabelas 7 e 8 não a prescrevem (a norma só manda interpolar em a/b,
   Nota 3). Inclinações intermediárias, por exemplo 12°, ficam bloqueadas.
2. **Inclinação exata:** a inclinação precisa coincidir com a linha da tabela. Na interface, que
   usa porcentagem, 10° corresponde a 17,6327 %. Um valor arredondado, como 17,63 %, é bloqueado.
   Fica para decisão uma tolerância de entrada (pendência N13).
3. **Planta retangular:** com a/b > 1, a Nota 3 exige interpolar I/J, e a figura da Tabela 7 não
   cota o fim da zona F/H. Continua bloqueado (pendência N14), como antes do N2.

## Aceite

`src/domain/reviewed-roof-shed-slopes.test.ts` confere:
- duas águas a 10° e 15° nas três faixas de h/b (beiral de 3, 9 e 12 m com b = 6 m), célula a célula,
  incluindo zonas e limites das faixas;
- uma água a 10° e 15°, nas incidências de 90° e −90°;
- o pipeline normativo completo a 10°;
- os bloqueios para inclinação intermediária, linha ausente no extrato, 45° com h/b > 1/2 e uma água com h/b ≥ 2.
