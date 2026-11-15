# M44-P1 — Auditoria de `coldformed_design.py` contra a ABNT NBR 14762:2010

Fonte: exemplar com camada de texto fornecido pelo usuário (2ª edição, 09.07.2010); fórmulas conferidas nas imagens das páginas impressas.
**Conferência documental, não homologação**; revisão profissional e erratas pendentes. O módulo cobre perfis formados a frio (U enrijecido declarado);
perfis laminados/soldados (I, W, H) pertencem à NBR 8800:2024 (próxima etapa, com a Errata 1:2025).

## Resultado da auditoria equação por equação
| Item | Norma (pág. impressa) | Código | Resultado |
|---|---|---|---|
| C.3.1 global (compressão) | λ0=(Afy/Ne)^0,5; 0,658^(λ0²)Afy (λ0≤1,5); 0,877Ne (>1,5) — p.75 | `compression_mrd` | conforme |
| C.3.2 local | λℓ=(Nc,Re/Nℓ)^0,5; limite 0,776; (1−0,15/λℓ^0,8)/λℓ^0,8 — p.75–76 | idem | conforme |
| C.3.3 distorcional | limite 0,561; (1−0,25/λ^1,2)Afy/λ^1,2 — p.76 | idem | conforme; γ=1,20 |
| C.4.1 FLT | Wfy (λ0≤0,6); 1,11(1−0,278λ0²)Wfy (<1,336); Wfy/λ0²=Me (≥1,336) — p.76 | `bending_mrd` | conforme (limite 1,336 é Me) |
| C.4.2 local / C.4.3 distorcional | 0,776 e 0,15/λ^0,8; 0,673 e 0,22/λ — p.76–77 | idem | conforme; γ=1,10 |
| C.5 deslocamentos | Ief = Ig·MRser/Mn ≤ Ig, MRser com Wfy→Mn (sem γ) | `effective_inertia_mrd` | conforme |
| 9.6.2 tração | Afy/1,10; An0 fu/1,35; Ct An fu/1,65 — p.34 | `tension_resistance` | conforme |
| 9.8.3 cisalhamento | limites 1,08 e 1,40·(Ekv/fy)^0,5; 0,6fyht; 0,65t²(kv fy E)^0,5; 0,905Ekv t³/h; γ=1,10; kv=5 sem enrijecedores — p.50–51 | `shear_unstiffened` | conforme |
| 9.7.4 | KL/r ≤ 200 | `compression-slenderness` | conforme |
| 9.9 flexão composta | NSd/NRd + Mx,Sd/Mx,Rd + My,Sd/My,Rd ≤ 1,0, N constante — p.53 | `combined-9.9` | conforme (capacidades por sinal; N não constante bloqueia) |

**Nenhuma divergência numérica foi encontrada.** Foram encontradas duas lacunas, ambas corrigidas:

1. **9.8.4 estava bloqueado indevidamente.** O código alegava que o MRd de 9.8.4 exige 9.8.2.1 (seção efetiva). A norma (8.4.1 c, p.25, e C.1, p.74) permite o
   método da resistência direta (Anexo C) em substituição a 9.8.2 para MRd. Implementada a expressão **sem enrijecedores transversais de alma**:
   `(MSd/MRd)² + (VSd/VRd)² ≤ 1,0`, na **mesma seção**, com máximo contínuo (inclusive interno ao trecho), MRd conforme o sinal do momento e VRd de 9.8.3.
   A variante com enrijecedores (`0,6 M/MRd + V/VRd ≤ 1,3`, exige 9.5) **continua bloqueada**; capacidade ausente por sinal também bloqueia.
2. **9.6.3 (L/r ≤ 300 em tração) não era verificado.** É **recomendação**: gera `tension-slenderness`, nunca FAIL (CONDITIONAL quando excedida; usa os comprimentos efetivos declarados).

Registrados em `checkProcedures` e em `availableNormativeProcedures`: `NBR14762:2010-9.8.4` e `NBR14762:2010-9.6.3`.

## Integração com combinações e solicitações (matriz peça × combinação ELU)
`member-combination-matrix.ts`: combinações ELU da **NBR 8681** (declaração de engenharia) × demandas do solver por estação × verificações NBR 14762.
- `fitSegmentForceField`: campo quadrático a partir das estações do PyNite, **verificado nas estações não usadas** (sem extrapolação; cúbica/parcial é recusada).
- `requiredChecks`: verificações exigidas pelos sinais da demanda (compressão, tração, flexão por sinal, cisalhamento, 9.8.4, 9.9, componentes sem procedimento).
- Linha por peça × combinação: fatores γ·ψ e cláusula 8681, envelope de esforços (valor, posição), verificações com demanda, resistência, utilização e cláusulas.
  Status `unsupported` (sem execução, verificação exigida ausente ou `BLOCKED`), `no-demand`, `FAIL` ou `CONDITIONAL`; nunca aprovação.
- Teste de ponta a ponta: NBR 6120 → NBR 8681 → PyNite real → demandas → `analyze_coldformed_design` (Python) → matriz; resistências conferidas à mão
  (MRd = W·fy/1,10; Nt,Rd = A·fy/1,10; Vrd = 0,6·fy·h·t/1,10) e vértice do momento calculado de forma independente.

## Limites (não suportado)
Seção com 2+ almas e cisalhamento em y; torção/empenamento; 9.8.4 com enrijecedores; dispensa de distorcional pela Tabela 14; N variável em 9.9 e compressão;
módulo resistente único por eixo (W com o mesmo valor nos dois sinais); ligações e esmagamento da alma; ELS/deslocamentos; coeficientes críticos elásticos são
**declarados/estudados**, não inferidos. `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

**Dependências:** #85 → #93 → #94 → #96 → #98 → #99 → #101 → este PR.
