# JPN — candidata de integração geral

Branch `integration/jpn-general-candidate`, criada da `main`
`cc516b6f5cc97750de5aecf7564fcaff47a1d4f3`. Sem merge na main ou deploy.

## Auditoria e decisões

O snapshot contém **64 PRs abertos**: 20 já ancestrais da main, 22 transportados
pela cadeia #83, 16 equivalentes/adaptados, três de dados/pesquisa incorporados,
um de pesquisa SCI preservado sem UI e dois experimentos antigos substituídos.
#59/#60 e #75/#79 têm, respectivamente, o mesmo HEAD; não receberam merges duplos.

- Um merge da #83 incorpora seus 156 commits exclusivos e toda a cadeia
  M35–M43, incluindo #75/#80–#83, preservando o histórico.
- #51 acrescenta as referências históricas UFSC, com lacunas e integridade
  verificáveis. Não são um modelo SAP2000 exato ou fatores normativos atuais.
- #42 e #45 preservam pesquisa Kg e registros históricos. Prompts e roadmaps
  antigos são documentos de arquivo, não instruções para esta candidata.
- #21 preserva biblioteca, componente e 20 testes. Seu documento exige revisão
  profissional antes do uso por clientes: o cartão SCI permanece sem importação
  no cadastro. Nenhum limiar foi promovido a orientação regulatória atual.
- #23/#39/#40/#47 já foram adaptados na main; #38/#48 já têm os arquivos finais
  correspondentes. Não foram mesclados novamente. As notas originais de #39/#40
  foram recuperadas sem trocar o código atual da interface.
- #54/#55/#57/#62/#63/#65/#66/#70/#76 estão incorporados por arquivos/patches
  equivalentes ou adaptações posteriores. #1 e #13 são alternativas antigas
  substituídas pelo pacote/WSGI atuais, não reinseridas.

Matriz completa por PR, SHA, arquivo e teste:
[PRS.md](../validation/integration-general/PRS.md),
[JSON com 1.563 registros de arquivos](../validation/integration-general/pr-matrix.json).
O [grafo](../validation/integration-general/ancestry-graph.mmd) representa
ancestralidade real dos HEADs; equivalência funcional não cria arestas fictícias.
O snapshot preserva dependências, commits exclusivos e equivalência de patches.

## Conflito resolvido

O único conflito de conteúdo ocorreu no `quick-project-form.tsx`, em dois
trechos da #21. Foram conferidos os imports e a posição do cartão: o formulário
ilustrado e suas preferências atuais foram mantidos. O arquivo final é idêntico
ao da #83. O componente SCI foi preservado inativo devido à revisão pendente,
não usado para substituir preferências ou criar apoios/cargas. Nenhum motor
ou coeficiente teve conflito ou alteração.

## Recursos acessíveis

| Recurso | Entrada e teste principal |
|---|---|
| Cadastro guiado, importação e obra salva | `/projetos/novo`; `quick-project-guided`, `integration-declared` |
| Studio, camadas, isolamento, busca e medição | Resultado → Modelo 3D; `profiles-3d`, `ux-actions`, `studio-measurement` |
| Demonstração Tom e apresentação móvel | `/demonstracao`; `m351-client-demo`, `m351-presentation-ux` |
| Nós/barras, materiais/seções e apoios físicos | Resultado → Engenharia → Preparação mista; `m35-irregular`, `m36-support-interfaces` |
| Panos reais, aberturas, terças e ações de área | Preparação → Cargas e combinações; `m39-physical-roof-workflow`, `general-integration` |
| Combinações declaradas e transmissão às barras | Mesmo fluxo; auditorias M39–M42 e testes PyNite reais |
| Análise elástica da obra atual | `/api/experimental/mixed3d` → worker Python real; `integration-generated`, `general-integration` |
| Cálculo de terças | `/engenharia/tercas`; `purlin-calculator`, transporte remoto protegido quando configurado |
| Resultados, relatórios e arquivos | Engenharia/Materiais/Arquivos; `resistance-report`, `delivery`, testes DXF/PDF/JSON/Excel aplicáveis |

## Jornada física conferida

O teste `general-integration.spec.ts` cadastra uma obra declarada, entra pelo
formulário um pano de 4 × 5 m com quatro segmentos reais de terça, registra
0,2 kN/m², confere distribuição e conectividade e salva/reabre a obra.
Materiais, seção e quatro interfaces de concreto são entradas explícitas do
fixture sintético; os dois nós centrais ficam livres. Não há cargas nodais
nulas de conveniência, pilares gerados ou propriedades inventadas pelo app.

Em **390 e 1440 px**, a interface envia seis nós/seis barras, quatro apoios e
quatro cargas distribuídas à API e ao PyNite 3.2.1. O hash da resposta coincide
com a entrada. As reações somam **4.000 N**; a flecha central coincide com
`-q L^4/(384 EI) = -0,003255208333 m`. Duplicar Iy invalida o resultado,
muda o hash e produz metade da flecha. O relatório exportado mantém
`NOT_READY_BLOCKED` e não libera fabricação. Os dois testes locais passaram.

As evidências de execução e capturas ficam no artefato da CI
`general-integration-browser-evidence`, junto ao SHA validado. O teste usa a
mesma jornada e motor existentes; não implementa um solver alternativo.

## Limites e validação final

M43 permanece experimental: P-Delta/corrotacionais `/1`, `/2`, `/3` não
substituem a solução linear da interface. A P5 mantém uma coluna verificada e
três casos espaciais pendentes. Resistência completa, capacidades de apoios,
homologação normativa, SCI e fabricação não foram habilitadas nesta integração.

O auditor verifica ancestralidade e blobs Git, impede sobrescrever fontes/testes/
goldens da #83 e exige deploy desabilitado na main e candidata. Somente dados,
registros, código SCI inativo e testes de integração foram acrescentados à base
validada. Limites, tolerâncias e coeficientes permanecem iguais.

A CI final executa typecheck, ESLint, Vitest completo, Pytest e 1.000 referências
por sistema, oráculos P2–P5 Linux/Windows, seis perfis numéricos, os seis ensaios
Kg históricos, QA UFSC, DXF, Playwright desktop/mobile e build. PDFs/Excel e
demais exportações aplicáveis permanecem nos testes existentes. O resultado,
SHA e links finais são registrados no PR, sem novo commit só para alterar o SHA.

`computedStructuralApproval=false`, `fabricationRelease=false` e
`NOT_READY_BLOCKED` permanecem obrigatórios. Sucesso numérico não é aprovação
normativa. Os dois `vercel.json` bloqueiam publicação automática desta branch.
