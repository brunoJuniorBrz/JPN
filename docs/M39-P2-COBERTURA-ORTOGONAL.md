# M39-P2 — Cargas em contornos ortogonais, L e aberturas físicas

**Status:** implementação em PR draft #70, base PR #69. Aceite depende de CI completa e revisão técnica; não liberado para fabricação.

## Finalidade

Levar a mesma ação de área do cadastro físico de cobertura para as terças **reais** do modelo `jpn.declared-structure/1` e, depois, para `jpn.mixed3d/2` do PyNite. Não produzir retângulo envolvente para completar planta em L, não lançar carga em abertura e não assumir capacidade de nenhuma parede/ligação.

## Origem, orientação e geometria

1. `physicalRoofFaces` declara superfícies coplanares XYZ em **mm**, contorno exterior CCW, furos CW, suporte físico por ID, fonte e revisão. Validação por `physical-roof-faces.ts`.
2. `auditPhysicalRoofCoverage` comprova que terças físicas pertencem ao plano e não atravessam furos/fora da face; confere sobreposição e cotas entre faces.
3. `orthogonalRoofCells` exige bordos X/Y, inclinação longitudinal nula em cada terça e particiona exatamente pelos X/Y dos vértices **e** extremos dos segmentos de terças; determina ocupação por teste de ponto interior. A soma das células deve coincidir com a área de todas as faces, por plano.
4. Cada célula deve ter **duas terças reais** coincidentes com seus limites transversais e abrangendo exatamente o comprimento longitudinal da célula. Peça longa sujeita a larguras tributárias diferentes obriga revisão e segmentação explícita `PURLIN_SEGMENTATION_REQUIRED`. Não aplica média de carregamentos variável em uma barra homogênea.
5. O mesmo ID de peça em dois panos ou duas células adjacentes transversalmente recebe a **soma dos carregamentos lineares** de suas faixas, sem duplicar projeções.

## Grandezas auditadas

Para cada célula de largura `b`, comprimento `L` e gradientes `dz/dx`, `dz/dy`:

- Área horizontal: `A_h = b * L`.
- Área de telhado inclinada: `A_s = A_h * sqrt(1+(dz/dx)^2+(dz/dy)^2)`.
- Resultante vetorial em N: `F = 1000 * knM2 * A * direção_unitária`.
- Transmissão simplesmente apoiada de uma célula de duas bordas: a largura tributária de cada terça é `b/2`; para pressão uniforme `q_linha = 1000 * knM2 * (b/2) * fator_de_área * direção_unitária`.
- Momento de uma contribuição ao redor da origem: `M = r_centroid × F`.
- Auditoria global por ação e por modelo: `ΣF_resultantes = ΣF_transmitidas`, `ΣM_resultantes = ΣM_transmitidos`, `Σárea_declarada = Σárea_transmitida`, dentro da tolerância numérica escalada (`1e-10` na camada de distribuição).

A transferência para `member_loads` é permitida apenas a barras `frame` mapeadas fisicamente. O solver precisa conservar equilíbrio global e hash de entrada/resultados. Hipótese de folha simplesmente apoiada é **idealização declarada de transmissão**, não cálculo da resistência da telha ou da ligação.

### Referências analíticas de regressão

| Cenário | Área horizontal | Carga uniforme de ensaio | Resultante vertical |
| --- | ---: | ---: | ---: |
| Plano em L (6×2 m + 2×3 m) | 18 m² | 0,20 kN/m² | -3,60 kN |
| Cobertura 6×5 m com abertura 2×1 m | 28 m² | 0,20 kN/m² | -5,60 kN |
| Dois panos de 4×5 m sem recorte | 40 m² | 0,20 kN/m² | -8,00 kN |

No L, em coordenadas de referência e carga vertical, o momento externo esperado em relação à origem é `Mx = -6600 N·m` e `My = +8400 N·m`.

## Aceite exigido

- Vitest geométrico: L, recorte, plano inclinado, direção horizontal, rotação global de 90°, purlin desconhecida, purlin sem associação e segmentação obrigatória.
- Vitest de integração: modelo L conectado via membros físicos, `adaptLoadedMixedProject`, carga real em `mixed3d/2`, execução Python/PyNite, soma de reações e resíduo de equilíbrio do motor.
- Regressões originais: `roof-load-path`, `wind-load-path`, `m34ab-declared`, assinatura/proveniência, dupla contagem e `NOT_READY_BLOCKED`.
- CI: TypeScript, ESLint, Vitest, Python Linux/Windows, DXF, E2E e build. O conjunto só será considerado aprovado quando a **CI do HEAD** terminar com sucesso.

## Fora do domínio / próximos marcos

- Polígonos oblíquos, curvas, paredes/fachadas, balanços sem terça de borda, terças com inclinação longitudinal, áreas de telha sobre terças faltantes, carregamento por zona não uniforme e ações do vento sem análise normativa.
- Segmentação automática de **vigas físicas** não é assumida. O engenheiro deve declarar nós e terças reais compatíveis.
- Não há verificação ELU/ELS do perfil, flambagem, ligação, fixação de telha, capacidade do apoio existente, base, chumbadores ou fundação.
- Só depois de M40–M45 completar essa cadeia e de revisão profissional poderão ser discutidas verificações de aprovação. O produto permanece com `computedStructuralApproval=false`, `fabricationRelease=false` e liberação `NOT_READY_BLOCKED`.
