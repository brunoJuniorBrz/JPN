# M41-P4 — Vento em paredes (NBR 6123:2023) → pilares → solver

Percurso funcional: `buildNormativeFacadeTraction` (src/domain/wind-facade-normative.ts) →
`distributeDeclaredFacadeTractions` (caminho existente) → `adaptLoadedMixedProject` → PyNite → reações.
Nenhum motor paralelo; a saída é o `declared-facade-traction` já auditado.

| Etapa | Fonte | Estado |
|---|---|---|
| q = 0,613·Vk², S2 | 4.2, 5.3.3 (módulo `wind-speed` existente) | funcional (V0, S3, categoria e classe declarados) |
| Cpe paredes a barlavento/sotavento (C, D, A, B) | 6.1.1 Tabela 6, p.20 do documento (PDF p.32); Nota 2 (interpolação a/b 3/2–2) | funcional |
| Cpi | 6.3.2.1 a) e b), p.43 (PDF p.55): +0,2/−0,3; −0,3 e 0 como cenários exclusivos | funcional |
| Pressão líquida p = q(Cpe−Cpi), positiva para dentro | 4.2 / 4.3 | funcional |
| Pressão → pilares reais → solver → equilíbrio de forças e momentos e reações | caminho M41-P3 | funcional (teste com PyNite real) |

Transcrição: lida das imagens do PDF escaneado (220 dpi); apenas as células de A, B, C, D foram carregadas
(`data/normas/nbr6123-2023-wall-cpe.json`). Erratas da edição **não verificadas**.

**Bloqueado (não presumido):** paredes paralelas ao vento (zonas A1/A2/A3, B1/B2/B3, C1/C2, D1/D2 e cpe médio),
frontões/platibandas, aberturas, abertura dominante (6.3.2.1 c), método detalhado 6.3.3, vizinhança 6.4,
alta turbulência 6.1.3, cobertura. Casos com paredes paralelas modeladas falham com
`WIND_FACADE_SIDE_ZONES_PENDING`. `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

**Dependência:** PR #85 (guarda de cargas de fachada duplicadas e auditoria congelada). Este PR parte da sua branch.
