# M37.1 — superfícies físicas de telhado não retangulares

## Entregue
Contrato `jpn.physical-roof-surfaces/1` em milímetros, salvo em `spatialPreparation.roofSurfaces`, independente do desenho visual ou dos retângulos gerados. Superfícies possuem anéis exteriores/recortes declarados, plano inclinado `z=z0+sx*x+sy*y`, referências às terças físicas, fontes e revisões. Reutiliza a validação poligonal do perímetro `roofOutline`.

A auditoria `reviewPhysicalRoofSurfaces` confere:
- consistência com a revisão geométrica de barras da obra;
- materialidade das terças, extremos nos planos e nas superfícies;
- áreas projetadas e inclinadas exatas para o modelo plano (inclusive planta em L);
- lacunas e dupla contagem, superfícies projetadas sobrepostas, cruzamento de contorno e descontinuidade de altura no encontro;
- dados pendentes bloqueiam a preparação mista, não são preenchidos por adivinhação.

**Não gera cargas nem vento**. A M39/M40 implementará uma transmissão conservativa dessa geometria para cargas de área/linhas e depois para os membros e apoios. Até lá, obras com geometrias declaradas podem executar cargas manuais já rastreadas; solicitações de vento ou geração automática em geometria declarada continuam bloqueadas. Não usar área do retângulo envolvente como substituta.

## Próxima expansão de tipologias
Implementar editor para captar contornos/superfícies reais do levantamento, importação/cadastro e verificação de cobertura com curvas/chapas dobradas, mais do que um plano, beirais e zonas de fachada. As superfícies sobrepostas em projeção (telhados em níveis sobrepostos) estão fora do domínio até um contrato explícito de camada.

## Testes e aceite
Os testes incluem planta em L (7 m² de projeção, não 16 m²), duas faces disjuntas com inclinação 1:4, geometria órfã, erro de cota, plano obsoleto, lacunas, sobreposição e recorte inválido. Tipo, lint, Vitest, Python e Playwright de regressão devem passar no HEAD; o aceite M37 completo exigirá também fluxo editável e transmissão de carga futura. Fabricar continua bloqueado.
