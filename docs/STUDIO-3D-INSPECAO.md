# Studio 3D — inspeção acessível de estruturas

## Escopo e isolamento

Evolução **somente visual**, implementada na branch `feat/3d-studio-inspection`. Não altera o modelo de engenharia, o motor Python, a análise estrutural, as propriedades físicas, o orçamento, o quantitativo ou os arquivos de saída.

O visualizador continua mostrando o modo **Acabado** sem filtros para preservar sua finalidade de apresentação.

## Recursos

- **Camadas por função:** pilares, banzos superiores, banzos inferiores, diagonais e montantes, terças. É possível mostrar ou ocultar cada grupo e restaurar todas as categorias com um clique.
- **Isolar peça selecionada:** selecione uma peça no modelo ou na lista e use **Isolar peça** para visualizar somente aquela barra. **Sair do isolamento** ou **Mostrar tudo** restauram a estrutura.
- **Vistas alinhadas:** **Superior**, **Frontal** e **Lateral** oferecem vistas de inspeção; **Isométrica · ajustar 3D** retorna à câmera padrão. São **perspectivas alinhadas**, não projeções ortográficas de desenho técnico e não substituem as vistas 2D cotadas.
- **Câmera persistente durante redimensionamento:** girar, ampliar e deslocar a vista não é cancelado quando muda o tamanho do contêiner; o controle de reenquadramento permanece explícito.
- **Dispositivos móveis:** ferramentas com alvos de toque de 44 px ou maiores, categorias em painel expansível, disposições específicas em 375 px e 370 px.

## Implementação

`profile-scene.ts` mantém as transformações originais de cada instância em memória. Ocultar uma peça modifica apenas sua matriz na cena (escala zero), mantendo todos os dados originais e os índices de seleção; restaurar reusa a matriz original. A atualização das matrizes e volumes de recorte só ocorre quando os filtros mudam, preservando a renderização por `InstancedMesh`.

As linhas dos modos Estrutural e Misto também respeitam camadas e isolamento por `BufferGeometry.setDrawRange`, sem modificar o modelo original. O destaque/indicador de peça segue a visibilidade.

Os controles são estados locais do componente React, não persistidos no levantamento. A camada de apresentação ignora temporariamente os filtros, restaurando-os ao voltar aos modos técnicos.

## Validação planejada

- Teste unitário verifica filtros por categoria, isolamento, desenho de eixos, restauração exata de transformações, seleção e imutabilidade do `StructureModel`.
- Testes Playwright nas larguras de 375 px e 1440 px verificam camadas, isolamento, orientação da câmera, redimensionamento, alternância com Acabado e ausência de alterações no armazenamento e quantitativos.
- Rodar lint, verificação TypeScript, Vitest, build e Playwright em ambiente com dependências do projeto antes de integrar.

**Limites:** não há cortes de seção, vista ortográfica real, ligações físicas, verificações resistentes ou detalhamento para fabricação nesta versão. Nenhum filtro da cena deve ser confundido com remoção de elementos estruturais.

## Incremento isolado — medição geométrica entre nós

A ferramenta **Medir entre nós** está disponível nos modos Estrutural, Perfis 3D e Misto.
Marque dois nós diretamente na cena, ou escolha **Nó inicial** e **Nó final**
nos seletores acessíveis para teclado/tela sensível ao toque. A cena destaca
os pontos escolhidos e desenha a linha entre eles. A interface mostra a
distância euclidiana e os componentes assinados ΔX/ΔY/ΔZ em metros.

Os dados são extraídos dos IDs e das coordenadas em milímetros de
`StructureModel.nodes`, com precisão integral no cálculo e arredondamento
somente na apresentação. **Nova medida** reinicia a seleção, e
**Encerrar medição** remove os marcadores e a linha de medição. Ao entrar
no modo Acabado, a ferramenta não aparece e seu desenho é ocultado;
os modos estruturais são preservados.

Esta ferramenta é apenas visual: não muda geometria, apoios, cargas,
quantitativo, propriedades resistentes, arquivos de saída ou persistência.
Não representa corte, tolerância de fabricação, levantamento em campo ou
medida verificada para execução.

Testes: casos unitários de diagonal 3D, direção/repetição, nós ausentes e
imutabilidade; testes Playwright nas larguras de 375 px e 1440 px, com
medição em cena, limpeza, ausência de scroll horizontal e persistência
local inalterada.
