# JPN — Catálogo técnico inicial sem preços (M20)

**Data da base:** 01/11/2026. **Base do desenvolvimento:** PR #20, integração Python remota experimental, ainda não mesclada na main. **Objetivo:** permitir que o projeto JPN original reutilize dimensões nominais e massas publicadas, sem se passar por dimensionamento e sem cadastro comercial de preços.

## Escopo entregue

- src/domain/published-profile-catalog.ts: 56 registros das tabelas técnicas pesquisadas, distribuídos entre W/I laminado (19), tubos retangulares (5), tubos quadrados (4), cantoneiras L (13), U simples formado a frio (9) e U laminado (6).
- Entradas possuem identificação P006–P061, designação, dimensões nominais, massa kg/m, URLs de origem da massa e das dimensões, data e conferência geométrica aproximada; todos os valores de entrada vêm da pesquisa. Alguns W usam fontes distintas para massa e dimensão, explicitamente identificadas.
- Tubos da Tuper tiveram peso teórico de barra de 6 m dividido por 6 para expressar kg/m. **Isso não significa que o fornecedor possua barras comerciais de 6 m.**
- Conferência de massa geométrica usa exclusivamente uma geometria simplificada vezes 7.850 kg/m³, sem raios ou filetes; **não substitui** os valores publicados, não estima massa de uma bitola ausente e não preenche a área resistente do solver. Divergências acima de 5%: P006, P047, P051 e P057 (revisão pendente).
- Em Estrutura → Perfis usados no levantamento, cada grupo ganhou uma opção explícita "Perfil publicado". Escolher uma opção importa massa, dimensões e geometria nominal de visualização 3D. Todas as informações importadas continuam **editáveis**.
- Não se altera o perfil escolhido pelo Tom sem ação explícita; não existe seleção normativa automática disfarçada.
- src/domain/published-profile-catalog.test.ts verifica 56 registros, origem, diferenças acima de 5%, conversão ao esquema antigo, preservação de dados físicos pendentes e contabilização da massa em projeto criado pela entrada rápida.
- Sem alterar schema de projeto, persistência ou histórico; sem pedir autenticação, preço, conta ou conexão externa durante a seleção.

## Fonte factual da pesquisa anterior

- Gerdau W (massa): https://mais.gerdau.com.br/produtos/perfil-estrutural
- Dobraço W (dimensões): https://dobraco.com.br/produtos/perfilwabasparalelasi/
- Gerdau cantoneiras: https://www2.gerdau.com.br/wp-content/uploads/2022/07/Tabela-de-Bitolas-Gerdau-2.pdf
- Tuper tubos: https://tuper-prd.s3.sa-east-1.amazonaws.com/uploads/2021/08/Tabela-Tecnica-de-Produtos-Tuper-2024.pdf
- Dobraço U simples: https://dobraco.com.br/produtos/perfiluestruturalsimples/
- Gerdau U laminados: https://mais.gerdau.com.br/produtos/perfil-u-viga-u

São *referências do levantamento* com data, não garantia de disponibilidade, preço, estoque ou especificação de aço. Para uso profissional revisar o documento original, fabricante, tolerâncias e eventual atualização.

**Cinco bitolas do pedido inicial NÃO ENCONTRADAS exatamente:** I 240 × 160 sem espessuras, tubo retangular 160 × 100 × 5, tubo quadrado 100 × 100 × 4, cantoneira L 70 × 70 × 5 e U 160 × 60 × 4. As opções disponíveis não foram silenciosamente renomeadas como essas bitolas.

## Limites importantes

**Nenhum perfil está apto automaticamente a alimentar o motor estrutural completo** apenas pela importação do catálogo. O módulo de análise mista requer ainda A/Iy/Iz/J, material E/G/nu, seções com eixos corretamente orientados, tipo/rigidez das ligações, apoios e carregamentos declarados. A massa publicada alimenta apenas o levantamento preliminar, e a densidade física permanece configurada separadamente, evitando dupla contagem.

O catálogo **não** escolhe automaticamente perfis adequados, não otimiza peso, não compara resistência, não verifica flambagem/serviço/2ª ordem, não gera proposta de compra liberada e não lista preços. Essa capacidade requer verificações normativas por família com documentação autorizada e revisão técnica.

## Próximas entregas recomendadas

1. Obter documentação técnica autorizada contendo área, inércias, constante de torção e classe do material para os perfis efetivamente usados pelo Tom. Não preencher valores ausentes com propriedades geométricas simplificadas sem revisão.
2. Integração explícita entre perfil escolhido no levantamento e grupos físicos do modelo; conferir correspondência da família, eixos e orientação; permitir completar ou substituir dados faltantes. Sem seções completas, o solver precisa indicar pendências, não calcular número fictício.
3. Converter carregamentos por área da cobertura em ações sobre terças com caminhos de transmissão, partição tributária e testes independentes.
4. Testar o fluxo real: entrada rápida → perfis declarados → apoios/ligação/cargas explícitas → adaptador → motor remoto → resultados no **mesmo projeto**, com revisões e invalidação ao editar perfil.
5. Dimensionamento e seleção automática futuros, por famílias e critérios normativos, mantendo a liberdade do Tom de substituir perfis e refazer análise.

**Não fazer merge automático:** esta PR está empilhada sobre a #20; validar CI, interfaces desktop/iPhone, dados de fontes e aprovar ordem de integração antes de alterar a main.
