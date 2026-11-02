# Evolução do JPN para levantamento de materiais

## Diagnóstico — 30/10/2026

O fluxo atual foi construído para formar preço de venda. O cliente é engenheiro e quer substituir o intermediário: o objetivo completo é gerar uma solução calculada, quantitativos e desenho, seguida de conferência final. A conferência não será requisito para exibir resultados ou exportar levantamentos. CAD fica por último. A escolha de perfis por resistência exige análise e verificações implementadas, com entradas e hipóteses rastreáveis.

Base preservada: Next/React/TypeScript, interface responsiva, validação Zod, persistência local atômica com detecção de conflito, backups, cálculos financeiros e documentos comerciais. O motor atual calcula o envelope de uma água e produz entidades 2D. Não representa barras, nós, ligações nem comprimentos de fabricação. As regras atuais de materiais por área/apoios não equivalem a um levantamento de peças.

## Primeiro incremento completo

Novo fluxo principal: Obra → Medidas → Estrutura → Materiais e cotação. O orçamento de venda permanece em uma área secundária, sem transferência silenciosa de preços ou quantidades.

Cobertura de uma água, com linhas de tesouras nos extremos, distribuição uniforme a partir de um espaçamento máximo informado, tesoura com banzo inferior horizontal e superior acompanhando a água, montantes e uma diagonal por painel. Altura da tesoura no lado baixo, painéis, espaçamento de terças no plano inclinado e perfis são entradas explícitas. Os comprimentos são entre eixos dos nós; não são medidas finais de fabricação. Dois pilares por linha; terças divididas por vão entre tesouras. Não inferir contraventamentos, emendas, chapas, fixadores, soldas ou sobreposições de telhas.

Fonte única: `StructureModel`, com nós 3D em mm, peças identificadas por papel/posição, extremidades, perfil associado e comprimento derivado. Vistas e lista consolidada são projeções desse modelo. IDs determinísticos permanecem estáveis para a mesma configuração; são locais ao projeto. Totais não são persistidos: são recalculados a partir das entradas. Quantidades físicas, medidas geométricas e compras comerciais são campos distintos. Massa desconhecida permanece pendente.

Perfis: especificação preenchida pelo usuário ou copiada do catálogo. Registrar designação, classe de aço, dimensões declaradas, massa linear, comprimento comercial e fonte. A cópia no projeto preserva o levantamento diante de mudanças no catálogo. Não incluir catálogo de fabricante sem dados verificados.

Persistência v3: manter a chave física existente; migrar snapshots v1/v2 em memória sem alterar medidas, custos ou propostas. Projetos antigos recebem configuração técnica vazia, sem peças inventadas. Gravar v3 apenas em uma gravação autorizada pelo uso. Backups antigos continuam importáveis; exportar versão atual. Nenhuma migração apaga ou sobrescreve arquivos antigos.

Documentos de cotação PDF/XLSX: não exigem preços, mostram peças, perfis, comprimentos geométricos, massa conhecida e pendências. Separar lista para cotação de pedido fechado de compra; não calcular barras comerciais pelo simples total dividido por 6 m. Dados incompletos devem aparecer como levantamento parcial.

## Validação

Casos conhecidos de área (10 × 20 m, 10% → 200,997512 m²), cinco linhas em 20 m com máximo de 5 m, conservação de peças/comprimentos/massa, sentidos de queda, IDs únicos e ausência de barras nulas/duplicadas, configurações inválidas e limites de geração. Reabrir documentos sem preços. Testar migração, backup, duplicação, mudança de medidas e navegador móvel. Manter testes comerciais.

## Próximos incrementos

Duas águas, outras treliças e ligações explícitas; catálogo oficial rastreável; corte 1D com perdas e sobras; soldagem quantitativa; DXF derivado do modelo central com validação em leitor CAD. Antecipar documentos de cotação ao módulo de fabricação para validar utilidade com o cliente.

O dimensionamento integra o objetivo do produto, e não é substituído pela conferência humana. Sua implementação depende de um contrato de análise versionado, incluindo nós, seções, materiais, apoios, ligações, cargas e combinações, com solver e verificações validados. O primeiro incremento entrega o modelo de peças e os quantitativos como base desse trabalho; não deve ser anunciado como dimensionamento completo. Nenhuma marca de revisão será usada para bloquear cálculos ou downloads. Perfis associados nesta fase não têm resistência verificada pelo sistema.

## Prioridade após a conclusão do motor estrutural — automatização do vento por localização (02/11/2026)

**Status: PRIORIDADE ALTA NO PRÓXIMO CICLO, NÃO INICIAR ANTES DE CONCLUIR E AUDITAR M23 (resistência) E M24 (ligações/estabilidade).** Registrar no planejamento de integração após a M24, antes da homologação do fluxo completo de engenharia. Não competir com os créditos destinados à validação do motor. A Missão 22 já recebe zonas, pressões e coeficientes *declarados* pelo engenheiro, transferindo as ações ao PyNite; o objetivo deste incremento é reduzir preenchimento manual com fontes normativas validadas, não substituir o motor existente.

### Resultado desejado para o engenheiro

1. No celular ou desktop, escolher **usar localização da obra** (com consentimento), digitar endereço ou fixar manualmente um ponto; armazenar latitude/longitude, precisão disponível, data e fonte. Nunca assumir que a posição atual do usuário é necessariamente o endereço da obra.
2. Consultar a **velocidade básica V0** por coordenadas em base geográfica de isopletas da edição aplicável da **ABNT NBR 6123:2023 e correções vigentes**, apenas quando a base estiver validada, licenciada e com método de consulta/interpolação documentado. Sem fonte adequada, V0 permanece pendente para entrada manual: não preencher por média meteorológica ou lista aproximada de municípios.
3. Avaliar automaticamente os fatores e a pressão dinâmica somente para os procedimentos, categorias e hipóteses normativas realmente implementados e testados; obter S1/S2/S3 e demais parâmetros exigidos da geometria da obra, ou **solicitar confirmação técnica** para rugosidade, topografia, classe, exposição, altura, fechamento, aberturas e incidências. GPS sozinho não define essas condições.
4. Gerar zonas/coefficientes de pressão externa e interna para as coberturas suportadas pelo JPN (retangular de uma/duas águas), com rastreabilidade da norma, edição, cláusula, fonte, dados de entrada, limites de aplicabilidade e responsável. Alimentar o contrato de vento M22 existente; não criar segundo solver.
5. Oferecer **edição manual em todos os parâmetros**, informando valor original, valor alterado, motivo, autor e revisão. Mudanças na localização, base normativa, coeficientes ou parâmetros invalidam o hash de entrada, as combinações e os resultados anteriores, exigindo recálculo e nova revisão.
6. Exibir claramente o que é **calculado e validado**, **declarado pelo engenheiro**, **sugerido para revisão** ou **pendente/não suportado**. Nenhuma automação equivale à aprovação de engenharia ou libera compra/corte/fabricação.

### Reaproveitamento de código e requisitos de qualidade

- Avaliar o módulo TypeScript de vento do projeto aberto **HyperFrame** (`candidoalfilho/hyperframe`, licença MIT), preservando avisos de licença quando reutilizado. O módulo inspecionado implementa principalmente procedimentos da **NBR 6123:1988** e forças de fachadas: **não copiar tabelas, coeficientes ou resultados como se fossem conformes à edição 2023**. Reutilizar somente lógica matemática independente das versões depois de revisão e testes.
- Pode-se usar APIs nativas de geolocalização, mapas e bibliotecas geoespaciais, mas elas **não oferecem por si mesmas os parâmetros normativos**; não confundir API de previsão do tempo com mapa de velocidade básica de projeto.
- Buscar documentação oficial/legitimamente acessível e exemplos normativos independentes, conferir edição e erratas vigentes, verificar direitos de uso da base cartográfica e documentar aproximação/interpolação, bordas e incerteza.
- Começar com prova de conceito enxuta: (a) geolocalização/seleção manual, (b) consulta V0 rastreável ou pendente, (c) S1/S2/S3 e q apenas se comprovados, (d) integração M22, (e) testes matemáticos, invalidação e tela móvel. Depois ampliar para zonas e coeficientes de telhados.
- Testes de aceitação: coordenadas próximas de limites de isopletas; fontes ausentes; GPS negado; endereço diferente da localização do usuário; hipóteses de terreno/fechamento desconhecidas; consistência de unidades e sinais; edições manuais; revisões normativas; regressão e conservação M22; ausência de aprovação indevida.

**Regra de prioridade:** ao terminar e auditar M23/M24, revisitar esta seção antes de ampliar visualização, recursos comerciais opcionais ou novas tipologias. Estimar esforço/créditos com base na fonte normativa realmente acessível e nos testes possíveis naquele momento.
