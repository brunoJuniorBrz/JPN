# M44-P2 — Perfis I/H soldados e laminados (ABNT NBR 8800:2024 com a Errata 1:2025)

Fonte: exemplar fornecido pelo usuário (3ª edição, 02.10.2024) **com a Errata 1 de 25.02.2025**; corpo escaneado, lido visualmente por página.
**Conferência documental, não homologação**; revisão profissional pendente. Código: `engine/jpn_structural/steel_i_design.py`
(independente do solver). Perfis formados a frio continuam na NBR 14762 (PR #102).

## Errata 1:2025 — aplicação integral
| Item da errata | Efeito neste PR |
|---|---|
| p.40, 5.2.5-a: `Ct = 100` → `Ct = 1,0` | **aplicado**: tração com seção sem furos usa Ct = 1,0 (teste) |
| p.iv Sumário; p.56 5.4.2.5 (remissão à Bibliografia); 6.7.2.1 equação e Tabela 18; Figuras 19 e 21; Anexos E, G, H, I, K, L numeração; O.2.3.3; O.2.5.2.3.1 | sem efeito nas cláusulas implementadas (registrados em `errata_not_relevant_to_implemented_scope` e no resultado) |
| p.51 5.3.5.4.3-b (cantoneiras); p.58 5.4.3.1.3-c (enrijecedores `j ≥ 0,5`); p.95 6.5.4-b | fora do escopo (cantoneiras, enrijecedores transversais dimensionados, ligações) — não implementados |

## Equações implementadas (páginas impressas)
| Verificação | Cláusula | Págs. |
|---|---|---|
| γa1/γa2 por tipo de combinação | 4.9.2.1, Tabela 3 (normal/especial 1,10 e 1,35; excepcional 1,00 e 1,15) | 25 |
| Tração: Ag fy/γa1 e Ae fu/γa2, Ae = Ct An | 5.2.2, 5.2.3, 5.2.4.2, 5.2.5-a | 39–40 |
| Esbeltez de tração (recomendação ≤ 300) | 5.2.8.1 | 44 |
| Compressão: χ, λ0, Ne = mín(Nex, Ney, Nez), Aef (larguras efetivas, c1/c2) | 5.3.2–5.3.5.1; Tabelas 4 e 5 | 45–49 |
| Esbeltez de compressão (recomendação ≤ 200) | 5.3.7.1 (5.3.7.2: outro limite é decisão do responsável) | 52 |
| Flexão eixo de maior inércia: FLT, FLM, FLA; teto 1,5 W fy/γa1; Cb | 5.4.2.1–5.4.2.3-a; D.2.1, D.2.2; Tabela D.1; D.2.8-a/e/f/h | 54, 137–146 |
| Flexão eixo de menor inércia: apenas FLM | Tabela D.1 (FLT só no eixo maior, D.2.8-g; FLA só em alma de U, D.2.8-c) | 144–146 |
| Cortante da alma (eixo maior): kv = 5,34 (sem enrijecedores ou a/h > 3) ou 5 + 5/(a/h)²; Aw = d·tw | 5.4.3.1.1–5.4.3.1.2 | 57–58 |
| Esforço normal + flexão (ramos N/NRd ≥ 0,2 e < 0,2) com máximo contínuo | 5.5.1.2 | 61 |

**Verificação cruzada do texto:** em D.2.8-a, com o `0,039` impresso, Mcr(λ = λr·ry) fica ≈ 0,2 % abaixo de Mr (constante arredondada da norma); um posicionamento
errado de Cb daria 30 %–100 % de diferença, o que o teste exclui para Cb = 1; 1,3; 2,0.

## Escopo e bloqueios (nunca silenciosos)
Suportado: I/H duplamente simétricos, soldado (propriedades calculadas da geometria) ou laminado (propriedades e raio declarados, com plausibilidade contra o I idealizado);
eixo local y = eixo de maior inércia; barra prismática; alma não esbelta.
`BLOCKED`: alma esbelta (λ > 5,70·√(E/fy) → Anexo E); comprimento destravado ≠ comprimento da peça (Cb por trecho); cortante nas mesas (5.4.3.5) e torção;
forças transversais localizadas (5.7); aberturas na alma (Anexo F); dados de ligação de tração ausentes; seções monossimétricas, U, T, caixão, tubulares.
Nenhum coeficiente é inferido: seção, aço, comprimentos efetivos e áreas líquidas são entradas declaradas.

## Integração
`member-combination-matrix.ts` ganhou o seletor de norma por peça (`pieceStandards`): a matriz peça × combinação ELU (NBR 8681) usa as verificações exigidas de cada norma.
Teste de ponta a ponta: NBR 6120 → NBR 8681 → PyNite real → demandas → `analyze_steel_i_design` → matriz (cortante `0,6·d·tw·fy/1,10`, teto de flexão e Cb recalculado
independentemente a partir do campo de momentos).

`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. **Dependências:** … → #101 → #102 → este PR.
