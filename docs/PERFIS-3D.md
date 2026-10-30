# JPN — seções metálicas no visualizador 3D

Implementação de 30/10/2026, sobre a v0.6. Seções ideais prismáticas em dimensões declaradas. O modelo continua preliminar: visualização não verifica resistência, orientação para fabricação, ligações ou interferências.

## Uso

Em **Estrutura**, abra uma categoria de peças e **Geometria da seção para visualização 3D**. Escolha a família e informe as dimensões da fonte em mm. O giro axial aceita 0–360°. Em **Resultado → Visualizar em 3D**, alterne **Estrutural**, **Perfis 3D** ou **Misto**. A câmera e a seleção permanecem ao alternar modos.

O modo Estrutural preserva os eixos originais. Perfis 3D mostra sólidos e mantém em linha as peças sem geometria válida. Misto sobrepõe os eixos aos sólidos. O resumo informa a cobertura dos dados; a seleção detalha a pendência de cada peça. Clique/toque ou use a lista acessível. O destaque segue o ID original, incluindo as instâncias.

## Contrato e famílias

`ProfileSpec.visualSection` é opcional e discriminado por `family`. Dimensões incompletas são `null`, permitindo salvar rascunhos. Valores negativos, nulos geometricamente impossíveis, não finitos e campos de famílias diferentes não produzem sólidos. O texto livre não é interpretado como dimensão. Nenhuma medida é obtida de massa ou área.

| Família | Campos próprios, em mm | Espessura |
|---|---|---|
| `rectangular-tube` | `widthMm`, `heightMm` | `data.thicknessMm` |
| `square-tube` | `sideMm` | `data.thicknessMm` |
| `circular-tube` | `diameterMm` | `data.thicknessMm` |
| `i` (I/H simétrico) | `heightMm`, `flangeWidthMm` | `webThicknessMm`, `flangeThicknessMm` |
| `channel` (U/C simples, sem enrijecedores) | `heightMm`, `flangeWidthMm`, `opening` | `data.thicknessMm` |
| `angle` (L) | `legXmm`, `legYmm` | `data.thicknessMm` |

`rollDeg` pertence a cada seção. `opening` vale `positive-x` ou `negative-x` no plano local do U/C. A largura das mesas do U/C é externa, incluindo a alma. Abas L também usam dimensões externas. Um tipo técnico explicitamente incompatível com a família gera aviso e linha; o formulário mantém ambos coerentes ao escolher a família.

Tubos precisam de `2t < min(b,h)`; I/H de `tw < b` e `2tf < h`; U/C de `t < b` e `2t < h`; L de `t < min(b,h)`. Não se presumem raios de dobra, filetes, soldas, tolerâncias, lábios de enrijecimento, mesas assimétricas ou propriedades resistentes. O limite de entrada para cada dimensão é 3.000 mm, com até três casas decimais no formulário.

As propriedades A, E, Iy, Iz, kg/m e preços continuam independentes e declaradas. Nenhum valor físico é recalculado a partir da representação. O usuário deve conferir a coerência entre dimensões e propriedades na fonte.

Projetos e catálogos antigos permanecem válidos sem o campo novo, mantendo linhas e pendências explícitas. Snapshots continuam v4: não há regravação na leitura nem migração destrutiva. A preferência visual fica separada em `jpn-viewer-mode:v1`, sem alterar projetos. Modificar dimensões cadastradas é uma alteração de especificação e mantém a invalidação conservadora das dependências já existente no sistema.

## Coordenadas e orientação

O domínio mantém mm e eixos X/Y no plano, Z vertical. Na cena em metros: `(X,Y,Z) = (x,z,−y)/1000`. Cada geometria reutilizável tem Z local de 0 a 1 m; uma matriz por peça aplica seu comprimento geométrico e coloca exatamente seus extremos nos nós originais.

O eixo longitudinal é Z local. Para uma barra no sentido +X do projeto, X local aponta +Y do projeto e Y local aponta +Z. Transporta-se esta base pela menor rotação de +X até o vetor inicial→final. Exatamente em −X, usa-se 180° em torno de +Z do projeto. Essa exceção é explícita: a menor rotação não é única no ponto antiparalelo. O giro positivo segue a regra da mão direita em Z local. A base não troca abruptamente de referência perto de barras verticais.

O centro da **caixa externa** da seção acompanha o eixo da barra; não representa centroide nem centro de cisalhamento de U/C ou L. Os sentidos dos nós são preservados. Não se acrescentam excentricidades, descontos, chanfros ou cortes de fabricação. A posição visual da abertura/abas não constitui validação estrutural ou aprovação para fabricar.

## Renderização e desempenho

`ExtrudeGeometry` sem bisel produz paredes, mesas, almas e faces de extremidade com vazios reais. BufferGeometry é compartilhada por seção, independente do comprimento e giro. Cada seção usa um `InstancedMesh`, inclusive entre categorias: cores por instância e um material metálico discreto compartilhado. Matriz e índice de instância mapeiam para os IDs das peças.

Iluminação hemisférica e direcional, material com rugosidade 0,65 e metalness 0,28, fundo neutro, grade e enquadramento incluindo as dimensões dos sólidos. Sem sombras dinâmicas ou pós-processamento. Culling usa caixas e esferas calculadas das instâncias. Seleção destaca a cor da instância e seu eixo laranja.

Renderização ocorre somente em eventos de câmera, seleção, modo ou tamanho. Não há loop de animação permanente nem amortecimento que mantenha a GPU ativa. OrbitControls permite arraste, zoom e gestos. Pixel ratio limitado a 1,5; cai para 1 com até 4 processadores lógicos, até 4 GB de memória declarada pelo navegador ou mais de 1.500 peças. Esses casos também desabilitam antialias e reduzem o tubo circular de 32 para 16 lados. Quando essas APIs não estão disponíveis, o limite de peças continua funcionando.

O círculo é uma aproximação poligonal inscrita: o diâmetro nos eixos e a espessura radial nos vértices são preservados. A flecha máxima relativa ao raio é aproximadamente 0,482% em 32 lados e 1,922% em 16. A diferença de área ideal é aproximadamente 0,641% e 2,550%, respectivamente; **esta malha não fornece A para o solver**. As seções poligonais usam suas dimensões exatas, salvo precisão Float32 da cena.

Trocar modos altera visibilidade e materiais, sem reconstruir cena/câmera. Geometrias, materiais, buffers de instâncias, observadores e eventos são descartados ao desmontar/reconstruir o visualizador, incluindo liberar o contexto. Sem WebGL2 ou com perda de contexto, o aplicativo informa a indisponibilidade e preserva o retorno às vistas 2D.

O teste de 3.000 peças confirma um único buffer de seção e uma única malha instanciada para dimensões iguais com comprimentos diferentes. Isso verifica compartilhamento e escala de alocações; não é um benchmark de FPS em celulares físicos.

## Exemplo verificável

Abra [perfis-3d.svg](../examples/perfis-3d.svg): seis seções frontais e suas extrusões de 100 mm, com dimensões e áreas analíticas de referência. Os casos são sintéticos, explicitamente sem catálogo comercial. [perfis-3d.json](../examples/perfis-3d.json) contém os dados de entrada. A imagem usa o mesmo gerador de geometria do aplicativo e foi inspecionada visualmente. Para regenerar com Node 24:

```sh
node examples/generate-profile-gallery.mjs
```

O arquivo é uma galeria de referência, não um backup importável de projeto. As áreas nele indicadas pertencem aos casos de teste, não são gravadas como propriedades dos perfis.

## Arquivos da implementação

- `src/domain/profile-section.ts`: contrato, validação, dimensões conhecidas, avisos e convenção de orientação.
- `src/domain/structure.ts`: inclusão opcional do contrato no perfil compartilhado.
- `src/components/planning/profile-section-fields.tsx` e `profile-fields.tsx`: cadastro por família.
- `src/components/planning/profile-geometry.ts`: contornos, vazios, extrusão e transformação local.
- `src/components/planning/profile-scene.ts`: cache, instâncias, cores, modos, seleção e descarte.
- `src/components/planning/structure-3d.tsx`: integração, luzes, qualidade, preferência e controles.
- `src/components/planning/structure-preview.tsx`: informações da peça selecionada.
- `src/components/planning/profile-geometry.test.ts` e `tests/e2e/profiles-3d.spec.ts`: referências geométricas e jornadas.
- `examples/perfis-3d.*`, `examples/generate-profile-gallery.mjs`, este guia e README: demonstração e entrega.

Motor Python, gerador paramétrico, fórmulas de quantitativos/corte/orçamento e geradores de documentos/DXF não foram alterados. Permanecem preliminares a geometria de levantamento, os quantitativos, a simulação de corte e a análise axial de tesoura isolada. Não há dimensionamento normativo, ligações ou sólidos de fabricação no DXF.

## Verificações desta entrega

Todos aprovados, sem falhas ou testes ignorados: **102 Vitest + 24 Playwright + 1.186 Python = 1.312 testes**. TypeScript `--noEmit`, ESLint e build Next.js de produção aprovados. Python inclui nova execução das 1.000 comparações com PyNite. DXF reaberto em ezdxf 1.4.5: 130 linhas 3D em mm, sem erros de auditoria; a suíte JS também usa dxf-parser.

Os 23 testes unitários adicionais verificam as seis seções, caixas externas, volumes contra áreas analíticas independentes, espessuras e vazios com raios, abertura U/C, extremos, barras verticais/inclinadas/antiparalelas, giro, dados inválidos/incompletos, instâncias/IDs, raycast real de sólido, modos, descarte idempotente, 3.000 elementos e compatibilidade com projetos antigos. A comparação do modelo confirma coordenadas, comprimentos, massa, corte e entradas do solver preservados com os metadados visuais.

As três jornadas adicionais cobrem modos, seleção por lista e clique/toque, recarga da preferência sem mutação do projeto, cadastro incompleto/completo e persistência. Desktop em 1.440 px e celular emulado de 375 px com toque e escala 2. As 21 jornadas anteriores preservam documentos, análise, orçamento, revisão, fallback sem WebGL e demais larguras. Galeria SVG e capturas 3D foram inspecionadas. Não houve teste em aparelho físico, benchmark de FPS ou implantação pública nesta etapa.

Referências de API: [ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html) e [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), conferidas junto dos fontes instalados da versão utilizada. Evidências e resultados desta execução em `docs/validation/2026-10-30-profiles-3d/`.
