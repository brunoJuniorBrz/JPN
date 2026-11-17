# INT-8 — Pranchas físicas para conferência

`createStructureDxf(project)` continua síncrona e mantém os botões existentes.
Obras com `physicalStructure` recebem layouts nativos de papel, além das barras
3D originais em mm. Obras geradas sem essa declaração mantêm o DXF 3D anterior.
Nenhum dado de engenharia, fórmula normativa ou bloqueio é alterado pelo CAD.

## Formatos e entrada compatível

```ts
createStructureDxf(project);                                  // A3 padrão
createStructureDxf(project, {format: "A1"});                   // A1
createStructureDxf(project, issuedAt, {format: "A1"});         // data explícita
const receipt = await prepareCadReactions(project, packetText);
createStructureDxf(project, issuedAt, {format: "A3", reactions: receipt});
```

A3 paisagem: 420 × 297 mm; A1 paisagem: 841 × 594 mm. Moldura a 10 mm;
carimbo reservado abaixo de Y=72 mm. Escalas geométricas escolhidas entre
1, 2, 2,5 e 5 × potências de dez, com valor escrito em cada folha. Textos,
tabelas e símbolos usam mm de papel; tabelas não possuem escala geométrica.
Vistas centralizadas na área útil, reservando espaço para cotas e carimbo.
Data em America/Sao_Paulo. Nenhum seletor de UI é modificado nesta entrega.

## Folhas e vínculos

- **INDICE:** nomes, números e escalas de todas as folhas, inclusive continuações.
- **PLANTA, FRONTAL, LATERAL:** peças, cobertura física, apoios e eixos de locação.
- **CORTE A-A:** interseção real no primeiro alinhamento de apoios, perpendicular
  à direção predominante das terças X/Y; plano e coordenada estão escritos.
- **TERCAS E CONTRAVENTOS:** IDs/perfis e espaçamentos projetados. Contraventamento
  exige identificação explícita em `label`/`group` (contraventamento/bracing/tirante).
  Outras barras web fora dos conjuntos aparecem como auxiliares, com PENDENTE;
  telhas e terças não passam a representar contenções automaticamente.
- **ESPACAMENTOS TERCAS:** peças, posições reais no corte, distância projetada e
  distância entre eixos no corte. Acima de 12 posições, as vistas apontam à tabela
  para evitar sobreposição de cadeias de cotas. Não são faixas tributárias.
- **PORTICO/TESOURA:** elevação por conjunto distinto coplanar em X ou Y, com cotas
  e perfis. Tesoura exige banzos superior e inferior declarados. Conexões gráficas
  usam nós comuns/junções explícitas; nenhuma tesoura ou pilar é criado.
- **IDENTIFICACAO:** locação de cada repetição, IDs originais e perfis. Conjuntos
  iguais são agrupados com **N×** somente quando geometria orientada, níveis Z,
  seções, materiais, orientação, vínculos e apoios declarados coincidem. Perfil,
  aço ou vínculo desconhecido impede agrupamento. Cargas não são equiparadas.
  Marcas com `(*)` remetem à identificação completa; todos os IDs permanecem na
  lista de materiais. Diferenças de perfil/aço/rotação/apoio/geometria separam folhas.
- **BASES E CHUMBADORES / BASES POSICOES:** locação, X/Y/Z, DOFs e tipo declarado.
  Símbolos indicam nós, nunca contornos de chapa. **PENDENTE DE PROJETO (A4/A5)**:
  não há chapa, furação, quantidade/diâmetro de chumbadores, solda ou capacidade inferida.
- **REACOES / RASTREIO REACOES:** quando fornecidas e conferidas, seis componentes
  globais concomitantes por nó e combinação em kN/kNm, ordem de análise e SHA.
  Ausência, recibo inválido ou projeto alterado: PENDENTE, sem imprimir reações antigas.
- **NOTAS GERAIS:** referências normativas/edições/fontes efetivamente declaradas,
  aço, fontes/revisões dos perfis, unidades, revisão e limitações. Edição ou norma ausente
  aparece PENDENTE; referência declarada não comprova aplicação integral da norma.
  Referências de vento, ações, combinações, pressão de fachada e marcas PROVISÓRIO
  são conservadas como declaradas, sem deduzir edição de texto livre.
- **MATERIAIS:** ID, perfil, quantidade, comprimento entre nós, kg/m e kg. Usa
  `declaredTakeoff`; kg/m deriva apenas de massa/comprimento conhecidos. Falta de
  perfil ou densidade rastreável permanece PENDENTE. Não é lista de corte.

Eixos X recebem A, B, …, Z, AA…; eixos Y recebem 1, 2, 3… em coordenadas crescentes.
São derivados de apoios/pilares/planos identificados. Sem esses dados, apenas
extremidades geométricas são referenciadas; apoios e pórticos continuam PENDENTE.
As mesmas letras/números são usados nas plantas, elevações e locação de bases.
Cada vão entre eixos é medido a partir das coordenadas, sem presumir equidistância.
Cumeeira só é nomeada em aresta alta comum de duas águas; bordas/beirais vêm das
faces físicas. Z de referência é o menor Z dos apoios declarados, não terreno presumido.

## Carimbo e padrão gráfico do projeto

Todas as folhas trazem obra, revisão, data, **Folha X de Y**, campos em branco
para **Responsável técnico, CREA e ART**, e o aviso:

**PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE**

Revisões extensas remetem às notas, onde o texto completo é conservado.
Este padrão gráfico é do JPN; não representa certificação de conformidade de desenho.

| Layer | Cor ACI | Tipo de linha | Espessura (mm) |
|---|---:|---|---:|
| EIXOS | 8 | JPN_EIXO (8, −2, 1, −2 mm de papel) | 0,13 |
| COTAS | 2 | Continuous | 0,13 |
| PERFIS | 7 | Continuous | 0,35 |
| CONTRAVENTOS | 6 | JPN_TRACEJADO (4, −2 mm de papel) | 0,25 |
| BARRAS_AUXILIARES | 8 | Continuous | 0,18 |
| COBERTURA | 4 | Continuous | 0,18 |
| APOIOS | 3 | Continuous | 0,35 |
| TEXTOS, MATERIAIS, MARCAS | 7 | Continuous | 0,18 |
| REACOES | 1 | Continuous | 0,18 |
| CARIMBO | 7 | Continuous | 0,50 |
| column / beam / topChord / bottomChord (3D) | 30 / 7 / 3 / 3 | Continuous | 0,35 |
| purlin / web (3D) | 4 / 8 | Continuous | 0,25 / 0,18 |
| IDENTIFICACAO / PRELIMINAR (3D) | 7 / 1 | Continuous | 0,18 / 0,25 |

Entidades usam propriedades por layer. Bolhas de eixos têm raio de 3 mm e linha
contínua. Estilo `JPN_TEXTO`: Arial.ttf, largura 0,85; notas 2,5 mm, marcas
2 mm, títulos 4,5 mm. Estilos `JPN_MM_<escala>`: DIMENSION alinhada nativa,
DIMLFAC=escala, DIMTXT=2,5, DIMASZ=1,5, precisão de 0,001 mm, ponto decimal e
traços oblíquos nos blocos gráficos. A medida nativa conserva o valor não arredondado.

## Reações e verificação

`prepareCadReactions` reutiliza `restoreMixedAnalysis`: reconstrói a entrada atual
e confere hash/contrato/rastreios existentes. Não executa outro solver. O recibo
é local à memória e vinculado ao projeto integral; não se fabrica por JSON nem
é reaproveitado após alterações. Resultados importados continuam experimentais,
sem origem homologada ou verificação de resistência das bases/ancoragens.
O projeto salvo não contém por si só o resultado misto completo: sem pacote,
o botão atual produz as pranchas com as reações explicitamente PENDENTE.

```text
npx vitest run src/lib/exports
npx tsc --noEmit
npx eslint .
python validation/integration-general/audit.py
python tests/verify_int8_dxf.py
```

Os testes geram `.tools/int8/galpao.dxf`, `galpao-a1.dxf` e `garagem-reacoes.dxf`.
`dxf-parser` e `ezdxf` conferem folhas, estilos, cotas independentes, modelos 3D,
agrupamentos, bases e reações. A conferência gráfica usa renderização independente;
não foi testada uma instalação comercial do AutoCAD. Geometrias de pórtico fora
dos planos globais, etiquetas muito densas e dados incompletos exigem conferência
manual e aparecem PENDENTE, sem recriar dados de engenharia.

Referência primária dos objetos nativos:
[Autodesk LAYOUT](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm),
[BLOCK_RECORD](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A1FD1934-7EF5-4D35-A4B0-F8AE54A9A20A.htm).
