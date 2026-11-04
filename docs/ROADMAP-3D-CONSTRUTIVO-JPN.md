# JPN — auditoria visual 3D e próximos incrementos construtivos

**Verificado na branch M32 / PR #44, SHA `566e068010446c3af8cb4889391ac177dcf752e3`.** O 3D não deve ser reconstruído. Este arquivo diferencia recursos existentes de itens futuros inspirados em vídeos públicos do eGalpão. A visualização de terceiros NÃO comprova cálculos, norma ou funcionalidade BIM completa.

## Implementado no JPN — não reprogramar

1. **Perfis com sólidos 3D:** `docs/PERFIS-3D.md`, `src/components/planning/profile-geometry.ts`, `profile-scene.ts`. Famílias visualizadas: tubos circulares/quadrados/retangulares, I/H, U/C simples e L. Geometrias extrudadas com vazios, instâncias compartilhadas, orientação da seção, seleção e foco. As dimensões visuais não representam, por si, propriedades de resistência aprovadas.
2. **Modo Acabado:** `docs/MODO-ACABADO-3D.md`, `src/components/planning/presentation-scene.ts` e `presentation-capture.ts`. Já há telhado texturizado (padrões visuais trapezoidal, termoacústico e junta agrafada), cores/opacidade, piso, paredes, pessoa e carro low-poly, cotas de apresentação, vista isométrica, tela cheia e captura PNG com advertência. **Não são telhas físicas comerciais modeladas peça a peça.**
3. **Studio 3D de inspeção:** `docs/STUDIO-3D-INSPECAO.md`, `src/components/planning/structure-3d.tsx` e `profile-scene.ts`. Camadas por função, isolamento de peça, vistas alinhadas superior/frontal/lateral, enquadramento e alvos táteis em celular.
4. **Documentos atuais:** `docs/PREPROJETO.md` e README registram DXF preliminar de eixos, vistas e PDF/XLSX de levantamento. Não há IFC de fabricação aprovado.

## Diferença observável para um 3D BIM/construtivo mais completo

| Recurso | Situação comprovada JPN | Próximo incremento adequado |
| --- | --- | --- |
| Telhado visto no render | Já existe como **plano visual com textura**, 1/2 águas | Modelagem opcional de painéis comerciais parametrizados com larguras, recobrimentos e cortes explicitamente informados; nunca converter textura em quantitativo físico |
| Terças/perfis | Sólidos ideais, várias famílias | Melhorar orientação, encontros, conexão visual com painéis, compatibilidade de seção e evidência de interferências |
| Contraventamentos | O gerador simplificado não pressupõe sistema físico completo | Desenhar **apenas** barras/ancoragens declaradas no modelo físico, sem inventar nós, comprimento ou rigidez |
| Chapas, furos, parafusos e enrijecedores | Auditorias de ligação parcialmente disponíveis fora do render; não há conjuntos 3D construtivos completos | Definir objetos paramétricos rastreáveis (base/chapa/furo/bolt/stiffener), extrusão e ID; representar apenas geometria declarada |
| Fundações | Não há verificação geotécnica/concreto global | Objeto ilustrativo facultativo, com rótulo de não verificado; não introduzir fundação estrutural presumida |
| Pranchas | Vistas e PDFs preliminares | Gerar vistas ortográficas, detalhes e pranchas cotadas **a partir da geometria declarada e de sua revisão**, sem rótulo de fabricação aprovada |
| IFC | Não implementado | Só depois de criar semântica e vínculos físicos suficientes: entidades, unidades, coordenadas, perfis, materiais, GUIDs, relações e verificação em leitor independente |

## Princípios que preservam o trabalho existente

- Fonte de dados continua `StructureModel` para peças geométricas; uma camada de detalhe construtivo deve ser **separada** e explicitamente vinculada aos IDs das peças, conexões e revisões.
- Não modificar `Ke`, `Kg`, cargas, forças, orçamento, cotação, DXF existente ou massas ao acrescentar um componente visual. Se uma futura ligação tiver relevância mecânica, essa nova propriedade deverá passar por contrato e verificação de engenharia, não por geometria ornamental.
- Marcar objeto como **`visual-only`**, **`declared-unverified`** ou **`verified-for-specified-checks`** conforme evidência; nunca tratar `visual-only` como `approved_for_fabrication`.
- Uma mesma fonte física deve alimentar vista, seleção/inspeção e exportação; mudanças de geometria invalidam detalhes/pranchas correspondentes. Não salvar screenshots como evidência de dimensionamento.
- Preservar desempenho mobile do visualizador: geometria compartilhada, lazy-loading, limites de instâncias, orçamento de draw calls, sem loop contínuo, fallback 2D para WebGL indisponível.
- Testar seleção, alinhamento, medidas, giro, unidades mm↔m, colisões/folgas declaradas, idempotência, exportação em segundo leitor e acessibilidade em iPhone.

## Ordem recomendada, sem competir com M33–M35

**Agora:** manter 3D existente e fechar origem normativa/fluxo completo de uma e duas águas. Não reabrir o Studio/Acabado por estética.

**Depois do beta de cálculo integrado:** incrementar conectores e objetos construtivos explícitos, primeiro bases, chapas e parafusos *meramente declarados*; depois pranchas e só então investigar IFC com verificador externo. Reservar cálculo e aprovação de ligação/fundação para missão de engenharia própria.

**Benchmark visual:** imagens públicas de software concorrente servem para comparar apresentação; não fornecem propriedades, dimensões, comportamento estrutural nem validação do seu exportador IFC.
