# UFSC 2023 — dados publicados para validação independente do JPN

**Fonte:** Davi Werner Benvenuti, *Análise e dimensionamento de um galpão industrial em estrutura metálica*, Universidade Federal de Santa Catarina, 2023. [PDF original](https://repositorio.ufsc.br/bitstream/handle/123456789/248184/TCC_Davi%20Benvenuti.pdf?sequence=1).

**Finalidade:** base versionada de referência externa para testes de regressão, não modelo SAP2000 exato nem aprovação de engenharia. Não substitui a conferência do TCC e das normas vigentes.

## Arquivos

- `source-model-actions.json` — geometria, materiais, ações, vento histórico, 9 combinações ELU e 3 ELS; páginas 55–61 e 81.
- `published-member-results.json` — pilares (Tabela 5), grupos de diagonais (Tabela 6), montantes (Tabela 7), banzos (Tabela 8), terças/longarinas, contraventamentos, tirantes, parafusos e mão francesa (Tabelas 9–20); páginas 64–79 e apêndice H.3.
- `published-displacements.json` — deslocamentos lineares/não lineares 2D (Tabelas 21/22) e 3D (Tabela 23), com IDs de pontos e pórticos; páginas 80–86.
- `audit-and-gaps.json` — dez divergências/ambiguidades documentais, onze requisitos ausentes para reconstrução exata do modelo e contas de referência independentes.
- `validate-reference.mjs` — checagem automatizada da integridade dos quatro arquivos e dos principais valores publicados.

## Executar

```bash
node validation/ufsc-2023/validate-reference.mjs
```

A validação compara valores-chave transcritos com números fixos confirmados nas tabelas, verifica quantidades, proporções Nsd/Nrd e oráculos aritméticos independentes. **Não extrai automaticamente o PDF original** e não garante que cada número já transcrito seja perfeito. Para alterar dados, abrir o original na página indicada e registrar a revisão.

## Regras para testes estruturais

1. Não confundir valores publicados de **envoltória por grupo** com solicitações de uma barra isolada.
2. Comparar sempre a mesma combinação, ponto, eixo, convenção de sinais e ordem de análise.
3. Não transformar cargas gráficas de vento em vetores XYZ sem geometria e orientação verificadas.
4. Não inventar conectividade, rotações de seção, liberações de barras, contraventamentos ou ligações.
5. **Terça biapoiada:** o estudo publica flecha arredondada de 4,3 mm. A expressão clássica com G/Q/W impressos prevê 4,321464447 mm; em outro ensaio o JPN atingiu 4,318088303 mm com 32 segmentos e cargas nodais tributárias. Esses últimos dois resultados são **derivados externamente**, não números publicados.
6. **Pórticos/tesouras e 3D:** as tabelas fornecem referências, mas o modelo SAP2000 exato NÃO pode ser reconstruído só a partir desta transcrição. Há propriedades de seção, nó-a-nó, ligações e histórico de cargas em aberto.
7. Sempre preservar `NOT_READY_BLOCKED`, `computedStructuralApproval=false` e `fabricationRelease=false`.

## Verificações feitas em 2026-11-05

- Confrontados com o PDF original os valores de dimensão e carga da página 60, os pilares da Tabela 5 (p. 64), diagonais/montantes das Tabelas 6/7 (p. 65) e os deslocamentos 3D da Tabela 23 (p. 86).
- Conferidas quantidades: 9 combinações ELU, 3 ELS, 3 linhas de pilares, 5 grupos de diagonais, 6 de montantes, 18 deslocamentos de extremos 2D ELU, 6 ELS e 27 de deslocamentos 3D ELS.
- Conferidos os quocientes demanda/resistência dos grupos e uma solução analítica independente da terça.
- Contradições/erros editoriais do TCC foram **preservados e sinalizados**, não corrigidos sem deixar rastros.
- **Pendência explícita:** as Tabelas 25–36 do Apêndice H ainda não foram transcritas integralmente; resultados de deslocamento armazenados são os resumos publicados.
- Não foi executada uma análise estrutural completa sobre estes JSONs. Eles não são um arquivo de entrada diretamente consumível pelo solver.

## Próxima fase

Quando a integração das branches do motor estiver na `main`, usar estes dados para construir **fixtures executáveis separadas** para terça, pórtico 2D e galpão 3D, somente com entradas fisicamente justificadas. Manter os valores de referência publicados intactos.
