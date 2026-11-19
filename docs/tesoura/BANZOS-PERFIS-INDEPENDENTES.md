# Perfil independente para banzos superior e inferior

## Contrato do modelo

- `chord` permanece como **banzo superior** em todos os projetos, compatível com o campo anterior.
- `bottomChord: null` indica que o **banzo inferior** utiliza exatamente o mesmo perfil de `chord`. O esquema Zod preenche `null` em projetos antigos e tipos antigos sem o novo campo.
- Cada `TrussType` carrega o próprio `bottomChord`; a escolha de um tipo/linha não altera a cobertura global, os apoios, as terças ou o perfil de outro tipo.
- Apoio em muros e pilares usa o mesmo contrato; nenhum vínculo/capacidade é inferido.

## Quantitativos e rastreabilidade

- `BS` recebe `chord`, `BI` recebe `bottomChord ?? chord`, montantes/diagonais recebem `web`.
- Orçamento agrupa a compra de barras por designação, massa linear, preço e folga, **independentemente da classe de banzo**. Quando os perfis divergem, as linhas identificam *Banzo superior* e *Banzo inferior*; quando coincidem, permanece o aproveitamento de barras em conjunto.
- O resumo mostra estimativas isoladas de barras superiores e inferiores, que **não se somam** quando compartilham o mesmo perfil. A compra agrupada é o total relevante para barras comerciais, sem liberação para fabricação.
- `applyTrussToProject` grava rótulos e atribuições de seção distintos para `BI`/`BS` no catálogo físico. A lista de materiais, o pacote CAD e o plano de corte leem essas atribuições; não há propriedade resistente inferida.
- `kg/m` segue sendo um dado nominal/editável do fornecedor, **não** uma propriedade verificada de resistência.

## Testes e limites

- `src/domain/truss-banzos-independentes.test.ts`: legado sem `bottomChord`, massa explícita, orçamento, compra, catálogo de seções por peça, plano de corte, muros, pilares e dois tipos na mesma obra.
- `tests/e2e/tesoura-banzos-independentes.spec.ts`: checkbox, seleção de perfil, troca de tipo e apoio.
- A referência do TCC UFCG mencionada nas notas da proposta é **indício de comparação de quantitativos**, não aprovação estrutural nem validação independente da massa até conferência dos dados originais de geometria/perfil.
- Nenhuma mudança em `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`, carga, vento, rigidez, E/G/I/J, ligações ou deploy.

**Critério de integração:** CI integral (typecheck, lint, Vitest, Python real, exportações, Playwright e build) no SHA final, revisão do diff e preservação dos bloqueios. Sem liberação de compra para execução ou fabricação.
