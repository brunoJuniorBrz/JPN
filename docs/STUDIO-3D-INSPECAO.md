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

## Incremento visual: inspeção rápida (03/11/2026)

- A peça selecionada apresenta uma **ficha visual concisa** junto ao modelo: ID, categoria, comprimento em metros e nome/seção declarada. Essa ficha utiliza apenas `StructureModel`, sem cálculos adicionais, e é explicitamente identificada como **não dimensionada**.
- A ficha permite **aproximar** a câmera da peça e **limpar a seleção**. Se o usuário selecionar uma categoria atualmente oculta, oferece **Mostrar categoria** para evitar a impressão de que a peça desapareceu.
- O controle **Recolher ferramentas** torna o 3D menos congestionado em telas pequenas; **Mostrar ferramentas** restaura camadas, isolamento e posições de câmera. Os modos Estrutural, Perfis 3D, Misto e Acabado não são alterados.
- Os controles usam alvos de toque de pelo menos 44 px e se reorganizam em 375 px. O painel não altera geometria, câmera automaticamente, quantitativos ou estado persistido.
- Foram acrescentados cenários Playwright em 375 px e 1440 px para ficha contextual, categoria oculta, recolhimento/restauração e verificação de que o projeto não muda.

### Situação de validação remota

- A base anterior do PR #23 (`1536e7e`) havia passado CI.
- A CI do incremento de 03/11/2026 não conseguiu iniciar os passos: os jobs de aplicação e estrutural finalizaram em poucos segundos com status failure, **sem steps/logs fornecidos pelo GitHub**. Isso não demonstra falha de TypeScript/teste, mas tampouco equivale a validação. Testes novos aguardam execução efetiva em um runner.
- Não houve merge nem deploy. O motor estrutural não foi tocado.

## Validação planejada

- Teste unitário verifica filtros por categoria, isolamento, desenho de eixos, restauração exata de transformações, seleção e imutabilidade do `StructureModel`.
- Testes Playwright nas larguras de 375 px e 1440 px verificam camadas, isolamento, orientação da câmera, redimensionamento, alternância com Acabado e ausência de alterações no armazenamento e quantitativos.
- Rodar lint, verificação TypeScript, Vitest, build e Playwright em ambiente com dependências do projeto antes de integrar.

**Limites:** não há cortes de seção, medições entre dois pontos, vista ortográfica real, ligações físicas, verificações resistentes ou detalhamento para fabricação nesta versão. Nenhum filtro da cena deve ser confundido com remoção de elementos estruturais.
