# Studio 3D — nova geração

Evolução do visualizador existente (`structure-3d.tsx`), não uma página nova. Tudo aqui é **camada de visualização**: nenhum dado do projeto, quantitativo, carga, contrato estrutural ou resultado de análise é lido de forma diferente, alterado ou recalculado. A estrutura continua identificada como **não dimensionada** nos modos de inspeção e de apresentação.

## Diagnóstico do estado anterior

- Luz chapada (hemisfério + direcional sem sombra nos modos técnicos), sem reflexos: perfis pareciam recortes de cor.
- Telhado do modo Acabado era um plano com textura, 35 mm acima dos eixos: as terças atravessavam a telha.
- Câmeras "Superior/Frontal/Lateral" eram perspectivas alinhadas, com troca instantânea.
- Sem corte, sem transparência contextual; ficha da peça fora da área do modelo.
- Sombra com frustum fixo (`max(vão, 20 m)`), pouco nítida em obras pequenas.

## O que mudou

| Área | Entrega |
|---|---|
| Materiais | Um material PBR compartilhado para todas as barras, com três acabamentos **visuais**: aço pintado, galvanizado e sem acabamento. A cor por função continua reconhecível em todos. Cores vindas de análise sempre prevalecem. |
| Luz | Ambiente procedural (`RoomEnvironment` + PMREM, sem download), tone mapping neutro, sol com sombra suave ajustada ao volume exibido, luz de preenchimento e plano receptor de sombra nos modos técnicos. |
| Cobertura | Relevo **geométrico procedural** (`roof-relief.ts`): trapezoidal, termoacústica com espessura e junta agrafada; cumeeira dobrada em duas águas; beiral visual de 12 cm; a telha repousa acima das terças. Botão "Ver estrutura sob o telhado". Telhado translúcido deixa de projetar sombra. |
| Câmeras | Iso, Superior, Frontal, Lateral com transição suave (420 ms, respeita `prefers-reduced-motion`) e **projeção ortográfica real** alternável sem salto de enquadramento. |
| Corte 3D | Plano de corte por eixo do projeto (X, Y, Z), posição em metros do projeto, inversão do lado visível. Recorte na GPU, inclusive das sombras; a geometria não é reconstruída. Peças removidas pelo corte não são selecionáveis. |
| Raio-X da seleção | Com uma peça selecionada, as demais ficam translúcidas e a peça é redesenhada opaca. Não move a câmera. |
| Interface | Seletor de modos segmentado, câmeras sobre o modelo, ficha da peça sobre o modelo no desktop (abaixo dele no celular) com nós e massa cadastrada, contador de chamadas/triângulos. |
| Resultados futuros | `studio-result-overlay.ts`: contrato e validação para sobreposições (deslocamentos, esforços, reações, verificação). **Nada é desenhado**: só define o que será aceito (hash da entrada e do resultado, combinação, motor, IDs de peças). |

Todos os rótulos, classes e atributos `data-*` usados pelos testes existentes foram preservados.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `studio-view.ts` | Matemática pura: poses de câmera, interpolação, plano de corte, acabamentos. Testável sem WebGL. |
| `studio-stage.ts` | Luz, ambiente, sombras e o par de câmeras perspectiva/ortográfica. |
| `roof-relief.ts` | Geometria procedural das telhas e da cumeeira. |
| `profile-scene.ts` | Barras instanciadas; agora com acabamento, sombras e raio-X. |
| `presentation-scene.ts` | Modo Acabado; usa o relevo e materiais PBR. |
| `studio-result-overlay.ts` | Contrato de sobreposição de resultados (sem renderização). |

## Desempenho medido

Mesmo projeto (exemplo de 10 × 20 m, 130 peças), Chromium headless com renderização por software, 1440 × 900. Arquivos em `validation/3d-studio/{antes,depois}/metrics.json`.

| Medida | Antes | Depois |
|---|---|---|
| Chamadas de desenho, Perfis 3D | 6 | 12 |
| Triângulos, Perfis 3D | 3 600 | 7 202 |
| Chamadas de desenho, Acabado | 20 | 41 |
| Triângulos, Acabado | 4 128 | 11 534 |
| Heap JS após os modos | 33 MB | 43 MB |
| Geração do ambiente (uma vez, após o 1º quadro) | — | 182 ms |

O dobro de chamadas e triângulos nos modos técnicos é o passe de sombra. O tempo de abertura medido pelo script inclui compilação do servidor de desenvolvimento e não é comparável entre execuções. Não há medição em GPU real nem em iPhone.

Cuidados mantidos ou acrescentados: renderização só sob demanda (a animação de câmera usa `requestAnimationFrame` apenas enquanto dura), geometria por seção reutilizada, material único, ambiente em 64 px em dispositivos limitados e 128 px nos demais, sombras desligadas em dispositivo limitado com mais de 600 peças, `dispose()` de todos os recursos, perda de contexto WebGL tratada.

## Limitações

- Relevo, beiral, cumeeira e acabamentos são ilustrativos: não são dados declarados de telha ou de revestimento.
- O corte não desenha tampas nas seções cortadas e não vale no modo Acabado.
- O raio-X não se aplica ao modo Estrutural (linhas).
- A seleção por clique continua desativada no modo Acabado.
- Encontros de peças não são recortados: barras continuam indo de nó a nó, como no modelo físico.
- Sem contraventamentos, ligações ou chapas além do que o modelo declara.
- Deslocamentos, diagramas e estados de verificação não são exibidos; só existe o contrato.
- Validação em celular feita por emulação de 375 px com toque, não em aparelho.

## Reprodução

```text
pnpm exec vitest run src/components/planning
pnpm exec playwright test tests/e2e/studio-next.spec.ts tests/e2e/profiles-3d.spec.ts tests/e2e/presentation-3d.spec.ts tests/e2e/studio-measurement.spec.ts
node validation/3d-studio/capture.mjs depois http://127.0.0.1:3000
```
