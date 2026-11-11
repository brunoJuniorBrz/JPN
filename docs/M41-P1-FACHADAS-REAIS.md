# M41-P1 — Cadastro físico de fachadas verticais e aberturas

**Estado:** PR draft; CI/integração pendentes. Não contém aprovação de cargas de vento.

## Objetivo
Representar a geometria tridimensional de **paredes, frontões e platibandas** do edifício real para preparar análise de vento em fachadas, inclusive cobertura sobre construção existente. Os panos podem ser revestidos, parcialmente revestidos, abertos ou desconhecidos. O estado de fechamento **não** fornece automaticamente coeficiente de pressão interna nem transforma uma parede em apoio estrutural.

## Contrato
- `jpn.physical-facades/1`; XYZ em milímetros, fonte e revisão obrigatórias, até 32 superfícies
- Cada fachada declara normal externa **+X, −X, +Y ou −Y**, contorno fechado, aberturas internas fechadas, categoria wall/gable/parapet, situação de fechamento e fonte específica da inspeção
- Contornos são armazenados em XYZ; para validação geométrica calculamos a projeção **local vertical** (u,z), escolhida de modo que a área externa seja positiva anti-horária e cada recorte seja negativo horário. Não há projeção de fachada para a planta XY
- As verificações usam segmentos, orientação, auto-interseção, abertura fora do perímetro, buracos que se tocam, fechamento de vértices e tolerância vertical de 0,01 mm
- Em `inspectPhysicalFacades`, a área líquida é a área exterior **menos** as aberturas. O centróide de área é calculado pelo primeiro momento dos anéis, não pelo centro da caixa envolvente
- As barras associadas precisam existir no modelo, estar no plano da parede e permanecer integralmente dentro da superfície revestida ou dos seus limites; não se aplica carga em abertura nem se presume rigidez do revestimento

## Exemplo analítico
Fachada vertical em X = 8.000 mm, comprimento 6.000 mm, altura 4.000 mm, abertura de 2.000 × 1.000 mm: área líquida **22 m²**, normal externa **+X** e centróide físico Y = 3.090,909 mm, Z = 2.045,455 mm.

Frontão com base de 6 m, altura de 3 m e cumeeira triangular a 5 m: área de fachada = **24 m²**, não os 30 m² de sua caixa envolvente.

## Limites
- Somente faces em **planos verticais paralelos a X ou Y**; paredes oblíquas e curvadas dependem de outro marco
- Sobreposição entre faces, volume de fechamento, coerência de pressões internas e compatibilidade normativa entre zonas **ainda não revisados**
- P1 **não calcula** pressão externa ou interna, q(z), coeficientes aerodinâmicos, forças nodais, ações nas travessas/contraventamentos ou reações de apoios
- `globalOverlapReviewed=false`, `windReady=false`, `computedStructuralApproval=false`, `fabricationRelease=false` por construção
- O caminho de vento para obras com estrutura física declarada permanece bloqueado pelo adaptador `mixed3d/2` até auditoria de zonas, transmissão e equilíbrio

## Próximo passo
M41-P2: revisar topologia e encontros de fachadas, volumes abertos/fechados e permitir apenas **pressões explicitamente fundamentadas e revisadas** para panes compatíveis; M41-P3: transmissão conservativa às barras reais com casos de vento +X/−X/+Y/−Y, sem coeficientes inventados. A norma aplicável precisa ter edição, cláusula, hipótese, domínio e validação rastreáveis.
