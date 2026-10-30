# Roadmap — JPN Projetos

## Entrega v0.6 — pré-projeto integrado

- [x] Duas águas simétricas e balanços longitudinais de terças, com contratos e testes.
- [x] Visualização 3D sob demanda, seleção e fallback 2D.
- [x] Perfis com E/A, propriedades de seção e origem/data declaradas.
- [x] Simulação FFD de aproveitamento, perdas explícitas, retalhos e rastreabilidade por peça; sem prova de ótimo ou liberação de corte.
- [x] Quantitativos vinculados ao orçamento, com bloqueio explícito após mudança da configuração.
- [x] Painel de análise de tesoura isolada, Python real por processo local ou HTTP privado, unidades/hash e invalidação.
- [x] Snapshot v4 com migração, revisões preliminares e limite de backup restaurável.
- [x] DXF 3D, SVG, vistas no PDF e exportação da simulação; leitores independentes e jornadas móveis.
- [ ] Dimensionamento normativo, ações/combinações, estabilidade global e liberação de fabricação.
- [ ] Estoques de múltiplos comprimentos, otimização exata e preços de compra por barra com comparação de alternativas.
- [ ] Implantação autenticada do serviço, aparelhos físicos e conferência no AutoCAD.

Detalhes e limites em [PREPROJETO.md](docs/PREPROJETO.md); o histórico abaixo descreve as etapas anteriores.

## Prioridade atual — solução calculada para revisão final

O produto mudou de foco: levantar e dimensionar a estrutura para substituir o intermediário. A revisão do engenheiro ocorre ao final, sem autorização obrigatória para exibir ou baixar os resultados. CAD fica na última etapa.

- [x] v0.5: fluxo de levantamento separado do orçamento de venda.
- [x] Modelo central 3D em mm com nós e peças de uma água: pilares, banzos, montantes, diagonais e terças.
- [x] Distribuição por limites geométricos informados, quantitativos, massa conhecida e seleção visual.
- [x] Especificações de perfil no catálogo, copiadas para o projeto sem dependência de preço.
- [x] PDF/XLSX de levantamento com pendências, peças identificadas e conferência final.
- [x] Migração v1/v2→v3 preservando os orçamentos e exemplos antigos.
- [ ] Catálogo técnico verificado, cargas, apoios, combinações e análise estrutural validada.
- [ ] Verificações normativas e seleção automática de perfis e distribuições por critérios técnicos e econômicos.
- [ ] Outras tipologias, ligações, soldas, telhamento comercial e plano de corte.
- [ ] CAD/DXF a partir do modelo consolidado, após as etapas acima.

As fases abaixo registram o histórico comercial; sua numeração não define a prioridade atual. Veja [DIMENSIONAMENTO.md](docs/DIMENSIONAMENTO.md).

## Fase 1 — Fundação concluída

- [x] Next.js, TypeScript strict, Tailwind e interface responsiva.
- [x] Projetos, busca, filtros, duplicação e exclusão confirmada.
- [x] Repositórios, persistência local, validação e tratamento de falhas.
- [x] Backup JSON, configurações e documentação.

## Fase 2 — Geometria concluída

- [x] Cobertura de uma água em quatro sentidos de queda.
- [x] Largura, comprimento, altura, inclinação e entrada com vírgula.
- [x] Área horizontal/real, comprimento inclinado, desnível e alturas.
- [x] Conversões centralizadas e motor puro independente de React.
- [x] GeometryModel em mm para planta, frente e lateral.
- [x] Eixos, cotas, indicação de queda e apoios somente quando informados.
- [x] SVG com zoom, pan, ajustar à tela, seleção de vista e gestos de toque.
- [x] Revisão geométrica, aviso preliminar e pendências técnicas.
- [x] Testes matemáticos, de orientação, apoios e geração de entidades.

## Fase 3 — Materiais e orçamento concluída

- [x] Catálogo com CRUD, busca, unidades, fornecedor, observações e preços próprios.
- [x] Cadastro de material dentro do projeto.
- [x] Quantidades manuais, área real, comprimento inclinado e apoios informados.
- [x] Perdas, conversão explícita entre unidade de compra/medição e arredondamento.
- [x] Preços dos projetos preservados diante de alterações no catálogo.
- [x] Mão de obra, despesas, encargos sobre custo/venda e prazo informado.
- [x] Markup e margem distintos, custo, venda, lucro e margem bruta estimados.
- [x] Centavos inteiros e operações exatas com BigInt.
- [x] Preço bloqueado por itens pendentes ou taxas inviáveis.
- [x] Dados v2 com migração e importação dos backups v1.
- [x] Cinco passos com campos maiores, linguagem direta e detalhes opcionais.
- [x] Projeto fictício completo com preços identificados como exemplos.
- [x] Testes unitários e jornadas em diferentes larguras de tela.

## Fase 4 — Entrega comercial disponível; CAD pendente

- [x] PDF comercial com escopo, total e condições, sem custos e margem internos.
- [x] Planilha XLSX interna com quantidades, preços, encargos e resumo financeiro.
- [x] Formulário de entrega com bloqueio por pendências, erros de gravação e condições ausentes.
- [x] Compatibilidade com projetos antigos e exemplo fictício identificado no PDF.

Próximos incrementos:

1. Instalar e consultar a API da versão escolhida de `@tarikjabiri/dxf`.
2. Consumir o GeometryModel existente para DXF em mm, mantendo camadas, textos, revisão e aviso preliminar.
3. Acrescentar medidas geométricas à planilha interna.
4. Gerar PDF interno detalhado.
5. Validar compartilhamento nativo e dispositivos físicos; download no navegador já disponível.
6. Testar DXF em CAD disponível e documentar qual software foi usado.
7. SCR somente após confirmar sintaxe e compatibilidade. DWG nativo continua fora do escopo.

## Fase 5 — Planejada

Coberturas de duas águas, modelos reutilizáveis, plano de corte, outros geradores, PWA offline testada, autenticação, sincronização remota, concorrência transacional, histórico de revisões e documentação técnica avançada.

## Melhorias contínuas

- Testar Safari iOS e Chrome Android em dispositivos físicos quando disponíveis.
- Ampliar proteção de rascunhos ao usar o histórico nativo do navegador.
- Avaliar catálogo maior e desempenho conforme o volume real de projetos.
- Manter typecheck, lint, testes, build e revisão visual em cada entrega.
