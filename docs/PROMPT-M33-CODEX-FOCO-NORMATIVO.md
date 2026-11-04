# Prompt enxuto — Codex M33 (depois da integração auditada da M32)

Você está trabalhando em `brunoJuniorBrz/JPN`. O objetivo é entregar um **beta de origem normativa de vento e combinações, limitado e comprovável**, para coberturas retangulares de uma e duas águas. **Não reconstrua o solver, o renderizador ou o caminho de carregamentos.**

## Ler primeiro — trabalho já adiantado

- `docs/MISSAO-33-PREFLIGHT-ORIGEM-NORMATIVA.md`: inventário de código, versões ABNT, referência, domínio e critérios de aceitação.
- `docs/VALIDACAO-OBRAS-REFERENCIA.md`: REF-04 (principal vento), REF-01 (V0 contraditório, não usar como oracle), REF-02 (normas históricas).
- `docs/ENTREGA-MISSAO-22-VENTO-COMBINACOES.md`: caminho físico existente e restrições importantes.
- `docs/ROADMAP-3D-CONSTRUTIVO-JPN.md`: melhorias 3D já existentes; **fora do escopo da M33**.
- PR #44 `566e068010446c3af8cb4889391ac177dcf752e3` (confirmar HEAD), PR #41 e PR #42 como dependências. Não mesclar automaticamente branches de pesquisa ou disparar deploy.

Arquivos a reutilizar: `wind-speed.ts`, `wind-contracts.ts`, `wind-load-path.ts`, `roof-regions.ts`, `roof-load-path.ts`, `engineering-combinations.ts`, `loaded-mixed-adapter.ts` e `engine-release-gate.ts`. Já existem testes detalhados de conservação e integração PyNite em `wind-load-path.test.ts`; não os reescreva.

## O que realmente precisa ser implementado

**A. Origem dos coeficientes e zonas (NBR 6123):**
1. Antes de codificar tabelas, confirmar texto **NBR 6123:2023 + Errata 1:2025**, edição/correções e figuras oficiais necessárias; documentar cláusula e limites para cada regra.
2. Construir provedor versionado que, para tipologias e incidências **realmente cobertas**, produza geometria de zonas `Cpe` e casos `Cpi` a partir de aberturas/fechamento declarados, sem inventar parâmetros.
3. Preservar `wind-speed.ts` existente quando matematicamente correto, verificar efeito da errata e rastrear `V0,S1,S2,S3,Vk,q`; onde faltarem isopletas licenciadas ou parâmetros da obra, exigir dado declarado com fonte e deixar a etapa correspondente **não verificada**.
4. Transformar a seleção normativa em entrada do `distributeWindActions`. Conservar força, momentos e sinais. Se uma zona física exigir discretização que o contrato atual não suporta, bloquear com motivo ou implementar subdivisão explicitamente testada: nunca aproximar coeficientes por média sem demonstração.

**B. Origem das combinações (NBR 8681):**
1. Utilizar a edição **NBR 8681:2025**, verificando normas complementares e condições aplicáveis, sem copiar fatores da edição de 2003.
2. Gerar combinações relevantes para ULS e SLS com fatores, grupos excludentes, vento principal/acompanhante, ação favorável/desfavorável e origem normativa por termo.
3. Reaproveitar `compileEngineeringCombinations`; **não transformar silenciosamente** `pending-engineer-review` em aprovado. Definir contrato novo/versionado de proveniência normativa com migração de históricos e bloqueio para parâmetros não cobertos.

**C. Aceitação independente:**
1. Obter de fontes legítimas os itens normativos necessários. Caso não estejam disponíveis, concluir só o subconjunto comprovável e bloquear o restante.
2. Antes de comparar com o software, registrar parâmetros e valores dos exemplos escolhidos em fixtures (origem, página, edição, revisões, hipóteses, unidades). **Não fabricar Cpe/Cpi, gamma/psi ou valores ausentes.**
3. Usar REF-04 para subcomparações de vento documentadas; REF-01 apenas em partes inequívocas após resolver divergência V0; REF-02 como histórico, não oracle normativo 2025.
4. Testar controles limites e negativos: pressão/sucção, faces, bordas, cumeeira, ângulos críticos, abertura desconhecida, combinação incompatível, zona com lacuna/sobreposição, geometria fora do domínio, dados ausentes e assinatura física obsoleta.
5. Demonstrar cadeia **norma → zonas/casos → cargas nas terças → combinações → solver PyNite → esforços/reações/relatório** para uma e duas águas, separando cálculo numérico de aprovação normativa.

**D. Integração mínima para uso:**
- Exibir claramente quais fatores foram calculados por norma, quais foram declarados e o que está bloqueado. Não obrigar edição manual de JSON em um fluxo destinado ao engenheiro comum, mas não iniciar uma reformulação de interface nem um novo visualizador.
- Manter `computedStructuralApproval=false` e `fabricationRelease=false`. Vento normativo parcial nunca concede resistência de perfis, estabilidade global, ligações ou fundações.
- Executar os comandos com locks fixados: Python, perfis opcionais, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, além da CI Windows/Linux. Não considerar evidência histórica como reteste atual.

## Forma de entrega

Branch nova a partir da base consolidada e auditada, PR em rascunho, sem deploy/merge automático. Código de cálculo, testes, fixtures, fontes e relatório técnico com matriz SUPPORT/DECLARED/BLOCKED. Se uma norma completa ou uma figura não puder ser obtida legalmente, não improvise: entregue o progresso comprovado e os bloqueios. Evite investir créditos em telhas 3D, IFC, CSS, refatoração geral, formatting global, CAD, orçamento ou implementação nova de FEM nesta missão.

**Pronto para M34 = geração de cargas e combinações no subconjunto suportado com referência independente, integração real e bloqueios corretos; NÃO = obra aprovada para fabricação.**
