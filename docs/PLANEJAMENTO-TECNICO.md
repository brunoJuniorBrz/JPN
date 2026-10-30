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
