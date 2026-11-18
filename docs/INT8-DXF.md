# INT-8 — Pranchas físicas para conferência

`createStructureDxf(project)` permanece síncrona e compatível com os botões
existentes. Não altera o projeto, quantitativos, pendências, cálculo ou liberação.
Sem `physicalStructure`, continua disponível o DXF 3D anterior.

## Formatos e entrada

```ts
createStructureDxf(project); // A3, 420 × 297 mm, paisagem
createStructureDxf(project, {format: "A1"}); // 841 × 594 mm
createStructureDxf(project, issuedAt, {format: "A1"});
const receipt = await prepareCadReactions(project, packetText);
createStructureDxf(project, issuedAt, {format: "A3", reactions: receipt});
```

A apresentação solicitada, de referência NBR 10068, usa margem esquerda de
25 mm, demais margens de 10 mm e carimbo de 180 × 55 mm no canto inferior
direito. Obra, revisão, data, Folha X de Y e campos em branco de Responsável
técnico, CREA e ART ficam em caixas. O quadro de revisões registra somente a
emissão atual; linhas vazias não inventam histórico. Não se declara certificação
normativa de desenho. A data usa America/Sao_Paulo.

Todas as folhas, inclusive continuações, mantêm:
**PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE**.

## Composição do galpão de teste: seis folhas

1. **Plantas de cobertura e estrutura:** índice no início, planta de cobertura e
   apoios, planta de terças e contraventamentos e tabela de espaçamentos.
2. **Elevações e corte transversal:** elevação frontal, lateral e corte A-A.
3. **Pórtico — tipo 1 (2×):** elevação e tabela de marca, perfil, quantidade e
   locação. Cada pórtico/tesoura distinto acrescenta sua própria folha.
4. **Locação de bases e chumbadores:** planta e posições de apoio. Reações
   conferidas são acrescentadas por combinação; tabelas extensas continuam
   em folhas adicionais. O detalhe continua PENDENTE DE PROJETO (A4/A5).
5. **Notas gerais:** notas numeradas em português técnico, aço, normas/edições
   efetivamente declaradas, unidades, revisão e limites. Metadados livres,
   fontes, hashes e mapa completo marca → ID original ficam na faixa pequena
   de **Rastreabilidade** no rodapé desta folha. Textos de origem são preservados
   nessa faixa, inclusive quando estão em outro idioma.
6. **Lista de materiais e resumo por perfil:** marcas, perfis, quantidades,
   comprimentos, kg/m e kg; resumo de comprimento/massa por seção e material
   declarado e massa total da estrutura. Não é lista de corte.

A paginação depende dos dados: não há limite artificial de seis folhas. Notas,
tabelas e rastreabilidade extensa recebem continuações, com carimbo e aviso.
O índice é planejado após a paginação: até nove entradas na primeira folha;
conjuntos maiores recebem continuação do índice, incluindo todas as páginas.

## Vistas, escala e identificação

As vistas usam **VIEWPORT nativo bloqueado**, com escala real 1:S. Projeções de
apresentação ficam em blocos `JPN_VISTA_*`, inseridos em uma área auxiliar do
espaço de modelo após a maior coordenada X + 1.000.000 mm. Esses INSERTs são
somente cache gráfico, separados entre si, sem alterar as barras 3D originais,
seus IDs, dimensões ou o projeto salvo. O primeiro viewport de cada layout é
o viewport de papel; os demais apontam aos respectivos caches. Ao usar o
espaço de modelo, não interpretar o cache como estrutura adicional.

A escala padrão mais próxima de 70% de ocupação da dimensão limitante é escolhida
entre 1:20, 1:25, 1:50, 1:75 e 1:100. Modelos maiores usam denominadores padrão
maiores quando necessários para caber, sem recortar a geometria. A escolha
reserva espaço para cotas, chamadas e símbolos; arredondamento para escala
padrão impede garantir exatamente 70%. Cada vista tem escala numérica e barra
gráfica em milímetros. Tabelas, textos e carimbo permanecem em mm de papel.

Marcas curtas determinísticas: C (pilar), V (viga), T (terça), BS/BI (banzo) e D
(barra auxiliar ou contraventamento identificado). O balão, afastado dos nós e
das barras, usa linha de chamada. Designações completas ficam nas tabelas,
nunca sobre as peças. Apoios usam AP1, AP2…; projeções coincidentes compartilham
um rótulo, sem eliminar apoios do modelo. Marcas densas continuam PENDENTE.

Eixos X: A, B… Z, AA…; eixos Y: 1, 2… em ordem crescente. Derivados de apoios,
pilares e planos identificados; na ausência deles, somente extremos físicos.
As mesmas referências aparecem em todas as vistas. Vãos entre eixos vêm das
coordenadas reais. Cotas totais coincidentes com o único vão não são repetidas.

O corte A-A intersecta as faces físicas no primeiro alinhamento de apoios,
perpendicular à direção predominante das terças. Arestas coincidentes são
traçadas uma única vez. A cota de cumeeira parte do ponto real da aresta alta
comum às duas águas; em uma água, cotam-se bordas, sem inventar cumeeira.
A referência de altura é o menor Z dos apoios declarados, sem terreno presumido.

## Padrão gráfico

Entidades usam cor e espessura por layer; nenhuma CTB externa é necessária
para definir espessuras. A prévia PDF é monocromática. No DXF, as cores ACI
preservam a distinção de layers. Impressão de espessuras está habilitada;
`LWDISPLAY=1`, `LTSCALE=1`, `PSLTSCALE=1`. A moldura não imprime bordas de viewports.

| Layer | ACI | Linha | Espessura (mm) |
|---|---:|---|---:|
| PERFIS, APOIOS | 7 / 3 | Contínua | 0,50 |
| CONTRAVENTOS | 6 | JPN_TRACEJADO (4, −2) | 0,50 |
| BARRAS_AUXILIARES | 8 | Contínua | 0,50 |
| EIXOS | 8 | JPN_EIXO (4, −1, 0,5, −1), traço-ponto | 0,18 |
| COTAS | 2 | Contínua | 0,25 |
| TEXTOS, MATERIAIS, MARCAS | 7 | Contínua | 0,25 |
| COBERTURA | 4 | Contínua | 0,25 |
| REACOES | 1 | Contínua | 0,25 |
| PENDENCIAS | 1 | Contínua | 0,35 |
| CARIMBO | 7 | Contínua | 0,50 |
| VISTAS | 7 | Contínua | 0,18 |
| column / beam / topChord / bottomChord (3D) | 30 / 7 / 3 / 3 | Contínua | 0,50 |
| purlin / web (3D) | 4 / 8 | Contínua | 0,50 |
| IDENTIFICACAO / PRELIMINAR (3D) | 7 / 1 | Contínua | 0,25 / 0,35 |

Estilo de texto `JPN_TEXTO`, Arial.ttf, fator 0,85: títulos 4,5 mm; títulos de
vista 3,2 mm; notas/cotas 2,5 mm; marcas/tabelas 2,1 mm; rastreabilidade 1,4 mm.
Eixos têm bolhas de raio 3 mm; balões de peças ajustam o raio ao comprimento da marca.
Estilos `JPN_MM_<S>`: DIMENSION alinhada, DIMLFAC=S, DIMTXT=2,5, DIMASZ=1,5,
precisão de 0,001 mm, ponto decimal e traços oblíquos. A medida nativa conserva
o valor completo. O texto nativo é `<>`, mantendo somente números após regeneração.
O identificador semântico de cada cota fica em XData `JPN_COTA`, sem prefixo gráfico.
O ponto de definição nativo coincide com a linha de cota, inclusive na cumeeira.

## Dados e pendências preservados

Agrupamento N× exige geometria orientada, níveis, perfis, materiais, orientação,
vínculos e apoios iguais e conhecidos. Conectividade exige nós comuns ou junções
explícitas atuais. Cargas não são equiparadas. Não são inferidos pórticos,
tesouras, apoios ou contenções. Contraventamento exige identificação explícita
na declaração; telhas/terças não viram contenção. Pórticos fora dos planos
X/Y globais ou não identificados continuam PENDENTE.

Quantitativos vêm exclusivamente de `declaredTakeoff`. Ausência de densidade,
perfil ou massa permanece PENDENTE, inclusive no resumo e no total. Perfis de
mesmo nome com seção/material distintos não são fundidos silenciosamente.

`prepareCadReactions` reutiliza `restoreMixedAnalysis` e seus contratos/hash:
sem pacote atual conferido, recibo inválido ou projeto alterado, não imprime
reações antigas. Preserva componentes concomitantes por nó e combinação,
sem tratá-los como capacidades. A ordem/origem experimental e SHA constam
na rastreabilidade. O botão atual, sem pacote, informa reações PENDENTE.
Bases, chumbadores, chapas, furos, soldas e fundações não são dimensionados.
Permanecem `computedStructuralApproval=false`, `fabricationRelease=false` e
`NOT_READY_BLOCKED`. A apresentação não constitui aprovação estrutural.

## Reprodução e evidências

```text
npx vitest run src/lib/exports
npx tsc --noEmit
npx eslint .
python validation/integration-general/audit.py
python tests/verify_int8_dxf.py
python tests/preview_int8_dxf.py
```

Os testes geram `.tools/int8/galpao.dxf`, `galpao-a1.dxf` e `garagem-reacoes.dxf`.
`dxf-parser` e `ezdxf` verificam folhas, viewports realmente ligados aos caches,
estilos, medidas analíticas, reações, modelos 3D e geometria da cumeeira.
O verificador também confere limites dos textos com as fontes reais e
não admite reparos silenciosos do DXF. O galpão analítico tem 9 peças,
36.000 mm de comprimento total e 942 kg; não é projeto liberado para construção.

`preview_int8_dxf.py` usa `ezdxf.addons.drawing` + Matplotlib, sem redesenhar as
vistas, para produzir PDF com todas as folhas e PNGs individuais para inspeção.
Converte mm de espessura para pontos tipográficos no backend PDF. Prévia
conferida: [galpao-pranchas.pdf](validation/int8/galpao-pranchas.pdf).
Não foi testado o AutoCAD comercial nem uma impressora física.

Referências técnicas primárias dos formatos e da renderização:
[Autodesk LAYOUT](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm),
[PLOTSETTINGS](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-1113675E-AB07-4567-801A-310CDE0D56E9.htm),
[escala de tipos de linha em viewports](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-4323BBAD-2757-4E92-B2E4-E0E550BB37CB.htm),
[ezdxf drawing](https://ezdxf.readthedocs.io/en/stable/addons/drawing.html).