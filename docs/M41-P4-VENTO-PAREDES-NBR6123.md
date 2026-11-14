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

## M41-P6 — Notas 1–5 e Cpi (p.20, 43, 44; imagens nítidas fornecidas em 14/11/2026)
Conferência documental, **não** homologação; erratas não verificadas.

| Regra | Estado |
|---|---|
| Nota 1 (h = Detalhe I da Tabela 7) | Tabela 7 não fornecida: `building.heightDefinitionConfirmed` obrigatório (declaração do responsável) |
| Notas 2 e 3 | implementadas e testadas (já conferidas) |
| Nota 4 (cpe médio) | faixa `min(0,2b; h)` = **zona de alta sucção** (6.3.2.1, p.44). Usada só como critério de zona para o Cpi de abertura dominante; **nunca** substitui o Cpe das zonas na carga global (teste); valores em `table6.cpeMedio` |
| Nota 5 (Ca, Figuras 4/5) | arrasto global não calculado (bloqueado) |
| 6.3.2.1 a), b) | inalterados |
| 6.3.2.1 c) barlavento | razões 1; 1,5; 2; 3; ≥6 → +0,1; +0,3; +0,5; +0,6; +0,8. **Sem interpolação** (a norma não prescreve): razão intermediária → `WIND_CPI_RATIO_NOT_TABULATED` |
| 6.3.2.1 c) paralela fora da alta sucção | Cpi = Ce do local (Tabela 6); abertura que cruza zonas ou a faixa é bloqueada |
| 6.3.2.1 c) paralela em alta sucção | razões 0,25…≥3 → −0,4…−0,9 (p.44), exige áreas declaradas; sem interpolação |
| Fallback Cpi = Ce da zona (p.44) | implementado para barlavento e paralela fora da alta sucção; em alta sucção **bloqueado** (ambíguo: Ce da zona × cpe médio) |
| 6.3.2.1 c) sotavento | **bloqueado**: remete à "Tabela 4" (Ce de paredes está na Tabela 6); referência cruzada não verificável |
| 6.3.2.2 estanque | −0,2 e 0 como cenários exclusivos; exige `characterization` explícita |
| 6.3.2.3 cilíndrica (h/d≥0,3: −0,8; <0,3: −0,5) | registrada em dados; **fora** do módulo retangular (erro `WIND_CPI_CYLINDRICAL_OUT_OF_DOMAIN`) |
| 6.3.3 método detalhado | **bloqueado** (só o início foi fornecido) |

Áreas de abertura são entradas **declaradas**, não verificadas contra a geometria; paredes com aberturas físicas continuam
bloqueadas pelo caminho de distribuição. Dominância (6.3.1): área ≥ soma das demais.
Geometria: `WIND_PLAN_MISMATCH` rejeita dimensão em planta divergente da distância entre fachadas opostas (cenário do PR #95:
12 m declarados × 8 m entre fachadas); PR #95 não foi editado.
**Dependências:** #85 → #93 → #94 → este PR.

## M41-P7 — terceira cópia (camada de texto), sotavento e método detalhado
- **Verificação independente:** a terceira cópia da norma (107 páginas, com camada de texto) confirma **54/54** valores da Tabela 6
  (0 diferenças), as Notas 1–5, os Cpi de 6.3.2.1 a)/b)/c), a tabela de alta sucção (p.44), 6.3.2.2 e 6.3.2.3. Revisão profissional e erratas permanecem pendentes.
- **"Tabela 4" (sotavento):** na edição 2023 a Tabela 4 é a de S3 (p.17): a remissão é desatualizada. Adota-se o Ce da parede de sotavento (Tabela 6, D/B) com `leewardTableReferenceResolved: true` (confirmação do responsável).
- **Nota 1 / Tabela 7 Detalhe I:** h = solo até o beiral, beiral ≤ 0,1 b (`eaveOverhangM`; `WIND_EAVE_OVERHANG`).
- **6.3.3 método detalhado (agora completo no texto, p.44–45):** `Σ A_j·sinal(Ce*_j−Ci*)·√|Ce*_j−Ci*| = 0`, resolvido por bisecção
  (raiz única). Validação independente: solução fechada de duas aberturas `Ci=(A1²Ce1+A2²Ce2)/(A1²+A2²)`, resíduo com três aberturas,
  monotonicidade, e coincidência com 6.3.2.1 a) (+0,2) para aberturas iguais em Ce=+0,7/−0,3. Ce* por abertura: barlavento, sotavento,
  zona paralela única (Ce da zona) ou **valor declarado com fonte**; faixa de alta sucção e aberturas que cruzam zonas exigem valor declarado.
- **Continuam bloqueados:** fallback Cpi=Ce em alta sucção (ambíguo), cilíndrica, vizinhança 6.4, alta turbulência/Ca, coberturas e frontões.
**Dependências:** #85 → #93 → #94 → #96 → este PR.
