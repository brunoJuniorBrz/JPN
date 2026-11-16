# INT-8 — DXF físico preliminar

`Arquivos → Exportar DXF cotado preliminar` preserva as barras 3D em mm e
acrescenta layouts A3 independentes: planta, frontal, lateral, corte A-A e
lista de materiais paginada. Não modifica a declaração nem libera fabricação.

As vistas são projeções nos eixos globais X/Y/Z do modelo físico. O corte
intersecta o plano Y do primeiro alinhamento de apoios; sua posição é indicada.
Folhas usam escala de impressão explicitada; cotas nativas DIMENSION têm
DIMLFAC correspondente e blocos gráficos próprios, mostrando medidas em mm.
Textos e linhas de tabela permanecem entidades CAD editáveis.

Cobertura vem exclusivamente de `physicalRoofFaces`. Cumeeira é identificada
somente em uma aresta alta comum a duas águas; sem dados, fica pendente.
Alturas usam o Z de referência dos apoios declarados, nunca um terreno ou uma
fundação inventados. Distância entre terças é medida entre suas interseções
reais no corte, ao longo da água, identificada como distância entre eixos.
As folhas não são detalhamento de ligações nem de seções para fabricação.

Designações vêm das seções atribuídas no catálogo físico. Comprimentos,
quantidades e massas vêm de `declaredTakeoff`; kg/m é derivado da massa e do
comprimento conhecidos. Sem seção/densidade rastreável, aparece PENDENTE.
Carimbo traz obra, revisão física, data em America/Sao_Paulo e aviso obrigatório
PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE.

Validação: `vitest run src/lib/exports/cad-sheets.test.ts src/lib/exports/cad.test.ts`
gera `.tools/int8/galpao.dxf`. `python tests/verify_int8_dxf.py` confere layouts,
associações e fatores de cotas com ezdxf, além dos testes com dxf-parser.
Não foi executada validação manual em uma instalação comercial do AutoCAD.

Referência primária dos objetos nativos:
[Autodesk LAYOUT](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm),
[BLOCK_RECORD](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A1FD1934-7EF5-4D35-A4B0-F8AE54A9A20A.htm).
