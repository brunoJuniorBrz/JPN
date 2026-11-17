# Obra do Tom — quantitativo do JPN × orçamento do Alan

**Data:** 2026-11-17 · **Estado:** estimativa comercial. `computedStructuralApproval=false`, `fabricationRelease=false`. Nenhuma peça foi dimensionada; perfis são os do Alan.

Fontes: planta do arquiteto, prancha AutoCAD do Alan e planilha `ton valores` (já transcrita em `tom-commercial-source.json`). Reconstrução e premissas em `tom-jpn-reconstruction.json`; cálculo em `src/domain/tom-jpn-comparison.ts` (usa o `packBars` do JPN); teste em `src/domain/tom-jpn-comparison.test.ts`.

## Geometria reconstruída

6 faces (corpo principal superior e inferior exposto, bloco central, bloco esquerdo, faixa de ligação, recorte) = **99,71 m² em projeção**. O retângulo envolvente 14,28×5,38 (76,8 m²) não serve; os 101 m² da planilha do Alan batem com a reconstrução.

Premissas: inclinação 12% (prancha do Alan ≈12–13%; arquiteto pede 10%), TR25 com 1,02 m úteis, avanço de 0,10 m na calha, terças a 1,34 m, barras de 6 m, corte de 3 mm, 5 mm de perda por ponta.

## Comparação

| Item | Alan | JPN | Alan (R$) | JPN (R$) |
|---|---:|---:|---:|---:|
| Terças Ue 75x40 (barras) | 20 | 20 | 3.100,00 | 3.100,00 |
| Tesouras U 75x40 (barras) | 6 | 8 | 810,00 | 1.080,00 |
| Telha TR25 (m lineares) | 107,65 | 107,65 | 3.767,75 | 3.767,75 |
| Parafusos | 600 | 635 | 360,00 | 381,00 |
| Fixação nas paredes | 0 | 30 apoios / 60 chumbadores | 0,00 | 154,80 |
| Veda-calha | 0 | 6 tubos | 0,00 | 122,52 |
| Calha + rufo (~22,8 + ~45 m) | não orçado | 67,8 m | 0,00 | 1.979–3.207 |
| Consumíveis | conforme planilha | igual | 1.613,54 | 1.613,54 |
| **Total material** | | | **9.651,29** | **12.199–13.427** |

Mão de obra: zero nos dois (não informada).

## Achados

1. **Terças:** o plano de corte do JPN fecha nas mesmas 20 barras (emendas sobre os apoios: 14,28 = 4,51+4,51+5,26). Correto no Alan.
2. **Telhas:** o total linear coincide, mas o Alan pediu pelo comprimento em planta (5,38; 2,71; 3,78; 2,65…). Com a inclinação e o avanço na calha, a peça do corpo principal precisa ter ~5,52 m. As 9 telhas de 5,38 chegariam ~14 cm curtas (reposição ≈ R$ 1.739). O JPN distribui a mesma metragem em comprimentos corretos e dispensa a telha extra de 3,78.
3. **Tesouras:** 2 vigas como desenhadas (sem diagonais) + 4 peças avulsas = 42,0 m de U → 8 barras. As 6 barras do Alan (36 m) só fecham se as peças avulsas não forem desse perfil. Confirmar com o Tom. Viga monoinclinada sem diagonais também precisa ser verificada pelo motor.
4. **Itens zerados ou ausentes:** a fixação nas paredes estava listada com quantidade vazia; calha e rufo não aparecem. São esses itens que fazem o orçamento real ficar 26–39% acima.
5. **Consumíveis (fora do motor):** 40 discos e 20 kg de eletrodo para ~590 kg de aço parecem altos. Vale conferir com quem solda.

## Pendências para virar referência de verdade

- Lançar as 6 faces no modelo físico (bordas altas/baixas reais → calha e rufo medidos, não estimados).
- Topologia real das tesouras e das 4 peças avulsas.
- Cargas, verificação dos perfis (terça Ue 75 com vão de até 5,48 m) e ligações. Só então liberar os bloqueios.
