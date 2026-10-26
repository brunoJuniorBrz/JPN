# Roadmap — JPN Projetos

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

## Fase 4 — Próxima entrega: documentos e CAD

1. Instalar e consultar a API da versão escolhida de `@tarikjabiri/dxf`.
2. Consumir o GeometryModel existente para DXF em mm, mantendo camadas, textos, revisão e aviso preliminar.
3. Implementar XLSX com medidas, itens, quantidades, preços, custos e resumo financeiro; testar coerência com o mesmo orçamento.
4. Gerar PDF comercial sem custos/margens internos e PDF interno detalhado.
5. Validar visualização e compartilhamento no celular.
6. Testar DXF em CAD disponível e documentar qual software foi usado.
7. SCR somente após confirmar sintaxe e compatibilidade. DWG nativo continua fora do escopo.

## Fase 5 — Planejada

Coberturas de duas águas, modelos reutilizáveis, plano de corte, outros geradores, PWA offline testada, autenticação, sincronização remota, concorrência transacional, histórico de revisões e documentação técnica avançada.

## Melhorias contínuas

- Testar Safari iOS e Chrome Android em dispositivos físicos quando disponíveis.
- Ampliar proteção de rascunhos ao usar o histórico nativo do navegador.
- Avaliar catálogo maior e desempenho conforme o volume real de projetos.
- Manter typecheck, lint, testes, build e revisão visual em cada entrega.
