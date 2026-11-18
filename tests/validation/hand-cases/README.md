# Casos de validação calculados à mão (rascunho de formato)

Os casos HC-A, HC-B e HC-C estão nesta pasta em formato manual `jpn.hand-cases/0-draft`, preservados sem alterar os valores esperados. São ensaios analíticos de ações e combinações, não projetos físicos `jpn.validation-case/1` aceitos pelo runner de `tests/validation/cases/`. O teste `src/domain/nbr8681-hand-cases.test.ts` roda o gerador NBR 8681 real e confere os valores esperados deste JSON.

Entradas marcadas como `declared` (cargas, Vk, cpe, capacidade) são valores de ensaio, não valores normativos.

## HC-A: sucção do vento na cobertura

1. Pressão dinâmica (NBR 6123 4.2 c): q = 0,613 × 30² = **551,7 N/m²**
2. Pressão efetiva (4.3.1): Δp = (cpe − cpi) q, com cpe = −1,0 (declarado).
   - Com cpi = −0,3: −386,19 N/m²
   - Com cpi = 0: **−551,7 N/m²**
3. Escolha do cpi (6.3.2.1 b): quatro faces igualmente permeáveis dão −0,3 ou 0, "o mais nocivo". Para a sucção o mais nocivo é cpi = 0.
4. Fatores de combinação da NBR 8681:

   | Situação | Fator | Item | Pressão (N/m²) |
   |---|---|---|---|
   | ELU normal, vento principal | 1,4 | Tabela 4 | −772,38 |
   | ELU normal, vento acompanhante | 1,4 × 0,6 | Tabela 6, ψ0 | −463,428 |
   | ELU especial | 1,2 | Tabela 4 | −662,04 |
   | ELS rara | 1,0 | 5.1.5.4 | −551,7 |
   | ELS frequente | 0,3 | ψ1 | −165,51 |
   | ELS quase permanente | 0 | ψ2 | 0 |

## HC-B: terça biapoiada (L = 6 m, faixa de 1,5 m)

Cargas lineares:
- G1 (aço) = 0,075 kN/m
- G2 (telha) = 0,15 kN/m
- Q (cobertura) = 0,375 kN/m
- W (sucção) = −0,82755 kN/m

| Passo | Combinação (item da norma) | wd (kN/m) | Esforço |
|---|---|---|---|
| 1 | ELU gravitacional, 5.1.3.1: 1,25 G1 + 1,30 G2 + 1,5 Q (Tabelas 1 e 4; vento de sucção omitido pelo 5.1.4.2) | **0,85125** | Md = wL²/8 = **3,830625 kN·m**; Vd = **2,55375 kN** |
| 2 | ELU de sucção, 5.1.3.1 com permanentes favoráveis: 1,0 (G1 + G2) + 1,4 W (Q omitida pelo 4.3.3.1) | **−0,93357** | Md = **−4,201065 kN·m** (inverte a mesa comprimida); arrancamento por apoio = **2,80071 kN** |
| 3 | Mesma sucção com permanentes desfavoráveis | −0,86982 | Menos crítica, 7% menor |
| 4 | ELS rara, 5.1.5.4 | máx. **0,600** (G + Q); mín. **−0,60255** (G + W) | |
| 5 | ELS frequente, 5.1.5.3: G + 0,7 Q | 0,4875 | |
| 6 | ELS quase permanente, 5.1.5.2: G + 0,6 Q | 0,45 | |

Não coberto: flecha (exige o perfil) e resistência do perfil.

## HC-C: arrancamento de um apoio em parede existente

Reações características: R_G = +3,10 kN, R_Q = +2,00 kN, R_W = −6,40 kN.

1. Permanente mínimo + sucção máxima (5.1.3.1 com permanentes favoráveis, γg = 1,0; Tabela 4, γq = 1,4; Q omitida): Rd = 3,10 − 8,96 = **−5,86 kN**
2. Só com o conjunto desfavorável: Rd = 1,25 × 3,10 − 8,96 = −5,085 kN. Isso subestima o arrancamento em **13,2%**.
3. Com capacidade declarada de 8,0 kN, a razão é **0,7325** (seria 0,6356 com o conjunto errado).

Pendente para o engenheiro:
- Tração no aço do chumbador pela NBR 8800 (item a conferir no texto, que não foi consultado).
- Cone e aderência na alvenaria ou no concreto (ficha do fabricante).
- Interação de tração com cisalhamento.
