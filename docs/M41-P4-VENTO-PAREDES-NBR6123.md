# M41-P4/P5 — Vento em paredes (NBR 6123:2023) → pilares → solver

Percurso funcional: `buildNormativeFacadeTraction` (src/domain/wind-facade-normative.ts) →
`distributeDeclaredFacadeTractions` (caminho existente) → `adaptLoadedMixedProject` → PyNite → reações.
Nenhum motor paralelo; a saída é o `declared-facade-traction` já auditado.

| Etapa | Fonte | Estado |
|---|---|---|
| q = 0,613·Vk², S2 | 4.2, 5.3.3 (módulo `wind-speed` existente) | funcional (V0, S3, categoria e classe declarados) |
| Cpe barlavento/sotavento (C, D, A, B) | 6.1.1 Tabela 6, p.20 (PDF p.32); Nota 2 | funcional |
| Cpe paredes paralelas ao vento: A1/A2/A3, B1/B2/B3 (α=0°), C1/C2, D1/D2 (α=90°) | Tabela 6 e figura; Nota 3 para A3/B3 | funcional (P5) |
| Cpi | 6.3.2.1 a) e b), p.43 (PDF p.55): +0,2/−0,3; −0,3 e 0 como cenários exclusivos | funcional |
| p = q(Cpe−Cpi), positiva para dentro | 4.2 / 4.3 | funcional |
| Perfil por zonas → reações de apoio simples entre pilares → solver → equilíbrio e reações | `profile` em declared-facade-traction | funcional (PyNite real, 4 fachadas) |

## Geometria das zonas (medida a partir da aresta de barlavento)
- α=0° (vento ⟂ parede de comprimento b): paredes paralelas de comprimento a. A1/B1: `min(max(b/3, a/4), 2h)`; A2/B2 até a/2; A3/B3 de a/2 ao fim. Nota 3: A3/B3 = A2/B2 em a/b=1; −0,2 para a/b≥2; interpolação linear entre eles.
- α=90°: paredes paralelas de comprimento b. C1/D1: `min(2h, b/2)`; C2/D2 o restante.
- Direções: o ângulo no caso é o lado de origem do vento (+X=0°, +Y=90°, −X=180°, −Y=270°). O programa orienta cada zona pela aresta de barlavento real da fachada (u: +X=y, −X=−y, +Y=−x, −Y=x).

## Transmissão do perfil
Pressão por trechos é transmitida por vãos simplesmente apoiados entre pilares físicos consecutivos
(reações `∫p·(L−u)/L` e `∫p·u/L`). Isso conserva exatamente força **e** momento; para pressão uniforme coincide com o
cálculo tributário anterior. O perfil exige cobertura contígua da largura e `netPressurePa` igual à média ponderada.

## Verificação da Tabela 6 (14/11/2026)
A digitalização local do PDF era de baixa resolução (dígitos 3/6/8/9 ilegíveis). Foi fornecida uma **cópia nítida** da
mesma tabela (página 32 de 107). Conferência célula a célula contra `data/normas/nbr6123-2023-wall-cpe.json`:
**54 de 54 valores coincidem, 0 alterações** (48 células Cpe = 6 linhas × 8 colunas A1B1, A2B2, C, D, A, B, C1D1, C2D2,
mais os 6 valores de cpe médio, não usados). Os rótulos geométricos das figuras (`b/3 ou a/4`, `menor que 2h`;
`2h ou b/2`) também conferem. Resultado: nenhuma célula está marcada como não verificada (`unverifiedCells` vazio).

Permanece **pendente a revisão normativa profissional**: a cópia nítida não é exemplar oficial certificado, erratas não
foram verificadas, e a captura não mostra as Notas 1–5 nem a p.43 (Cpi; Nota 3 e Cpi seguem da leitura da página original,
nítida nesses trechos). O portão `coefficientConfirmations` (erros `WIND_COEFFICIENT_UNCONFIRMED` /
`WIND_COEFFICIENT_CONFIRMATION_MISMATCH`) permanece implementado e testado para qualquer célula futuramente listada em
`unverifiedCells`.

**Bloqueado (não presumido):** frontões/platibandas e paredes com aberturas, abertura dominante (6.3.2.1 c), método
detalhado 6.3.3, vizinhança 6.4, alta turbulência 6.1.3, cobertura, cpe médio (Nota 4, verificação local).
`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

**Dependências:** PR #85 → PR #93 (P4) → este PR (P5).
