# M42-P2 — Ações gravitacionais de cobertura (ABNT NBR 6120:2019)

Fonte: exemplar escaneado fornecido pelo usuário (2ª edição, 30.09.2019; páginas do documento = páginas do PDF − 6). **Conferência documental,
não homologação**; emendas/erratas posteriores não verificadas; revisão profissional pendente. Dados em `data/normas/nbr6120-2019-actions.json`.

## Percurso completo e comprovado
`applyNbr6120Actions` → casos + `loading.roofArea` (superfície) / carga nodal → caminho existente `parallel-purlin-strips` (superfície → terças → pilares/apoios)
→ `applyNbr8681Combinations` (PR #99) → adaptador → **PyNite real**. Teste de ponta a ponta com forças e momentos de reação (incluindo binários dos engastes)
conferidos à mão, equilíbrio por combinação e invalidação após alterar a obra.

| Ação | Cláusula | Tratamento |
|---|---|---|
| Telhas (Tabela 5, 16 itens) | 5.4, p.13 | permanente, kN/m² na **superfície inclinada** (`roof-surface`) |
| Forros, dutos, *sprinkler* (Tabela 8, 9 itens) | 5.4, p.14 | permanente, kN/m² em planta (`horizontal`) |
| Peso específico do aço (Tabela 1: 77–78,5; médio 77,8 kN/m³) | 5.2–5.3, p.9 | **auditoria** da densidade declarada (`steelSelfWeightAudit`); o catálogo/solver continua dono do peso próprio (sem duplicidade) |
| Sobrecarga de cobertura | 6.4, Figura 2, p.29–30 | `q = 0,50·α` (0,25 ≤ q ≤ 0,50), α=1 (1–2 %), 2−0,5·i (2–3 %), 0,5 (≥3 %); **projeção horizontal**; inclinação calculada da face; i < 1 % bloqueada |
| Redução a 0,25 kN/m² por drenagem | 6.4 | só com declaração do Anexo D (verificação não calculada) |
| Carga concentrada de 1 kN | 6.4, p.30 | caso nodal em nó declarado, **isolada** das demais variáveis (NBR 8681: principal sozinha no ELU; fora do ELS, registrado como `missingSLS`) |
| Outras cargas permanentes (ex. painéis) | 5.1/5.4 | somente valor + fonte + descrição **declarados** |

Mapeamento NBR 8681: sobrecarga e concentrada usam a linha da Tabela 6 "… garagens e **coberturas**" (ψ 0,8/0,7/0,6, citada explicitamente na própria tabela);
a classe de peso (Tabela 1 da 8681) das ações permanentes é **declarada** (`permanentType8681`), nunca presumida.

## Bloqueios e limitações (não suportado)
Tabela 6 de 6120 (telhados com estrutura: duplicaria o peso próprio); Tabela 10 (forro/laje de cobertura, cargas de uso); neve/granizo/pó; empoçamento progressivo (Anexo D);
envelope de posições da carga concentrada (posição declarada); faces com inclinações que geram cargas diferentes (`NBR6120_PER_FACE_LOAD_UNSUPPORTED`: o caminho atual
aplica um valor por caso); pontes rolantes e seções 6.6–6.12. O limite de 10 combinações por execução (contrato/solver) não foi alterado.
`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

**Dependências:** #85 → #93 → #94 → #96 → #98 → #99 → este PR.
