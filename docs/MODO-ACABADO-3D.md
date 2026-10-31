# Modo Acabado — apresentação 3D para o cliente

## Propósito e separação técnica

Na visualização 3D da estrutura, existe agora uma **quarta opção: Acabado**. É uma camada visual isolada, usando Three.js puro e os mesmos eixos métricos do visualizador. **Estrutural**, **Perfis 3D** e **Misto** continuam disponíveis com as seleções e controles originais. O modo Acabado não modifica `StructureModel`, preços, quantitativos, cálculo estrutural, revisões, catálogo nem DXF/PDF; não integra a lista de materiais.

O projeto armazena os nós das peças em **milímetros**, mas o renderizador já utiliza **metros** com a transformação `(x_mm/1000, z_mm/1000, -y_mm/1000)`. Os objetos glTF foram criados em **metros** e dimensionados ao carregar para uma pessoa de aproximadamente **1,70 m** e um veículo de **4,50 m**. Não multiplicar os GLBs por mil.

## Recursos

- Cobertura texturizada de **uma ou duas águas**, usando um plano de dois triângulos por água, apoiado nas dimensões, inclinação e orientação da cobertura. Textura gerada localmente em `CanvasTexture` de 512px, com padrões leves para **trapezoidal**, **termoacústica (visual)** e **junta agrafada (visual)** e opções de quatro cores.
- **Opacidade** do telhamento ajustável para revelar parcialmente as tesouras.
- **Piso** de concreto visual e paredes simples opcionais: nenhuma, apenas fundo, laterais, fundo com laterais ou todas. O layout não altera materiais da obra.
- Referências humanas: `public/presentation/person-lowpoly.glb` (~1,7 m) e `public/presentation/car-lowpoly.glb` (~4,5 m). **Modelos low-poly originais criados para o JPN**, em vez de dependências externas ou licenças de terceiros. Os arquivos são pequenos (aprox. 12 KB e 27 KB), e `GLTFLoader` e modelos são carregados sob demanda na primeira entrada em Acabado, com fallback geométrico local. Não há telemetria ou CDN obrigatório.
- HUD com vão, comprimento, altura baixa e altura máxima, e tarja **PRÉ-PROJETO VISUAL · NÃO DIMENSIONADO** que permanece visível no modo. As cotas podem ser ocultadas, não a advertência.
- **Salvar imagem PNG** captura apenas a cena 3D e compõe título, cotas opcionais e advertência legível **VISUALIZAÇÃO PRELIMINAR — NÃO É DIMENSIONAMENTO E NÃO LIBERA FABRICAÇÃO** diretamente no arquivo.
- Câmera isométrica, fullscreen e interação por toque continuam disponíveis. Para escolher peça volte a Perfis 3D.

## Performance e isolamento

O visualizador preexistente já utiliza `InstancedMesh` por seção para centenas de barras, além de renderização **somente em mudanças** (OrbitControls sem damping/loop permanente), ResizeObserver, budget de framebuffer e seleção via raycasting. No Acabado, o pixel ratio fica limitado a **2**; textura do telhado é 512px; há um único sol com sombra suave (desabilitada em configuração reduzida). `canvas.dataset.drawCalls` e `canvas.dataset.triangles` permitem inspeção em testes. Metas de draw calls dependem de quantidade de materiais distintos e hardware; não são garantias para todo modelo.

Não são modeladas telhas reais, fixadores ou paredes fabris. **A aparência não altera a engenharia e não é prova de execução segura**. Orientação da telha é uma representação esquemática; para projeto executivo são necessárias cargas, conexões, verificações normativas e documentação adequada.

## Teste manual recomendado

1. Criar pré-projeto 10 × 20 × 4 m (duas águas) e abrir Perfis 3D.
2. Selecionar **Acabado** e conferir telhado e piso; alternar paredes e telhas, ajustar opacidade, mostrar/ocultar pessoa e veículo.
3. Conferir escala da pessoa e carro, cotas e advertência; girar, aproximar e abrir tela cheia no Safari do iPhone e no PC.
4. Baixar PNG e confirmar título/medidas/aviso; retornar a **Perfis 3D** e selecionar uma peça.
5. Recarregar o projeto e confirmar que os quantitativos e perfis não mudaram. Repetir para cobertura de uma água.
