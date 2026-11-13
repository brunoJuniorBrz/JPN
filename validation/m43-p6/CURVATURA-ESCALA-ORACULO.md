# C1 do pedido M43-P6 — escala do oráculo de curvatura material

Branch lateral `audit/m43-p6-curvature-oracle` (base `29dc614`), para o Codex incorporar por cherry-pick ao PR #89. Nada de produção, contratos ou arquivos de outras frentes foi tocado.

## Diagnóstico

Derivação, com `u ∈ [0,1]`, `ds = L0 du`, `R = Swing(e1→t)·Rx(φ)`:

```text
vee(Rᵀ R,u) = [K21, K02, K10],  K = Rᵀ R,u        (sem fator 1/2: K = [w]×  ⇒ K21 = w1, K02 = w2, K10 = w3)
κ = vee / L0
U = ½ ∫0^L0 (GJ κ1² + EIy κ2² + EIz κ3²) ds = 1/(2 L0) ∫0^1 (GJ v1² + EIy v2² + EIz v3²) du ,  v = vee
```

O teste arquivado usava `vee/2` e não aplicava `1/(2·L0)`. O produto dos dois desvios é `L0/2`, logo só coincidia com o candidato em L0 = 2 m. Medido (`validation/m43-p6/scale_probe.py`):

| L0 | candidato (J) | oráculo antigo / candidato | oráculo corrigido / candidato |
|---|---|---|---|
| 1 | 30,481961953 | 0,50000 | 1,0000000000 |
| 2 | 15,240980977 | 1,00000 | 1,0000000000 |
| 6 | 5,0803269922 | 3,00000 | 1,0000000000 |

**Conclusão:** a equação do candidato (`material_curvature.energy`) está correta; o erro estava só no oráculo. Nenhum valor esperado foi alterado para recuperar testes: o oráculo foi refeito com a escala física explícita.

## O que foi feito

- `test_material_curvature.py`: o teste de derivada matricial agora usa `vee` sem `/2`, prefator `1/(2·L0)` e é parametrizado em L0 = 1, 2, 6.
- `test_material_curvature_oracle.py` (novo, 56 casos): R construído com `scipy` e construção própria dos diretores, derivado por estêncil de 3 e de 5 pontos.
  - reprodução da causa (razão `L0/2` do oráculo antigo; oráculo corrigido a 1e-9);
  - candidato × oráculo em 3 comprimentos × 4 rigidezes (isotrópica, anisotrópica, eixo fraco, torção mole) × 4 conjuntos de rotações combinadas;
  - estudo de passo: ordem observada 2,00 (3 pontos) e 4,00 (5 pontos) nas faixas assintóticas; acima do piso de arredondamento (~7e-12 J, ≈ 2e-13 relativo), que é a incerteza do próprio oráculo;
  - `U(L)·L` constante de 0,5 a 50 m (1e-13) e `U` linear nos três módulos (SI);
  - torção pura em forma fechada `GJ(θj−θi)²/(2L)` (1e-12);
  - flexão biaxial em forma fechada `2 tan²a/L · (EIy sin²φ + EIz cos²φ)` (swing em z) e `EIy cos²φ + EIz sin²φ` (swing em y), para rolagens de 0°, 30°, 90° e 137° e eixo fraco/forte muito distintos;
  - gradiente por diferenciação automática do candidato × diferenças de 4ª ordem do funcional do oráculo.

## Resultado

`python -m pytest experiments/m43_p6 -q`: **176 passaram** (os 15 testes anteriores de curvatura continuam verdes) em Windows, Python 3.12, numpy 2.5.4, scipy 1.18.1.

## Não coberto aqui

Hessiana e reações/momentos físicos conjugados continuam cobertos pelos testes existentes (`test_material_energy_gradient_hessian_sensitivity`, `test_material_physical_balance_and_ad_orders`); não os dupliquei. Etapas 2 a 8 (SPATIAL, TORSION, SWAY, auditoria da formulação, CI Linux) **não foram tocadas** e seguem com o Codex.

## Para a integração futura (C1)

O campo de P6 usa a referência `Swing(e1→t)·Rx(φ)`, em que o giro `φ` vem da decomposição swing-twist da orientação nodal. Essa não é a convenção Z-up da C1 (`jpn-z-up/1`) nem a base histórica do PyNite: antes de qualquer integração é preciso demonstrar a equivalência com a base física declarada, inclusive com `Iy ≠ Iz`.
