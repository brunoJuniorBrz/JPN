# Editor de preparação estrutural — entrega de interface e dados

## Finalidade

O JPN pode criar uma cobertura visual 3D a partir de poucas medidas. **Isto não é um modelo físico analisável**. O novo painel **Preparar análise**, nas ferramentas do pré-projeto, coleta dados físicos declarados pelo responsável sem exigir edição de JSON e sem executar qualquer suposição estrutural ou liberar fabricação.

O motor Python PyNiteFEA 3D da missão anterior permanece isolado; o painel **Análise 3D experimental** continua disponível para modelos físicos explicitamente formulados em `jpn.frame3d/1`. **A preparação não chama esse motor**, pois a conversão geométrica para modelo de pórticos/treliças com juntas e caminho de cargas coerentes ainda está pendente.

## Como usar

1. Em **Novo projeto**, informe largura, comprimento, altura e tipologia e abra Perfis 3D.
2. Nas ferramentas do pré-projeto, abra **Preparar análise**.
3. **Aço e seções:** escolha o grupo (pilares, banzos superior/inferior, montantes/diagonais ou terças). Declare classe, fontes/edições, E, G, ν, A, Iy, Iz, J e giro dos eixos locais reais. Copie um grupo ou perfil do catálogo existente quando houver dados; campos faltantes ficam em branco, inclusive **G/J** que não existiam no catálogo antigo. É possível guardar a declaração física em um material já cadastrado para reutilização.
4. **Apoios e ligações:** selecione bases identificadas pela geometria e marque individualmente UX/UY/UZ/RX/RY/RZ como **pendente/livre/restrito**. A aplicação em lote de um engaste ou articulação requer escolha e clique explícitos; nunca é automática. Declare por grupo juntas rígidas/articuladas/axiais com descrição técnica do sistema lateral e das ligações.
5. **Cargas e combinações:** informe fontes, casos, forças e momentos nodais (com sinais, unidades e zeros explícitos), coeficientes de combinação e caminho das cargas. Não são inventados vento, peso próprio ou coeficientes normativos.
6. **Conferência:** acompanhe pendências, geometria desatualizada, contatos sem nó ou propriedades incompletas. Exporte a preparação para revisão técnica. O JSON exportado é `jpn.spatial-preparation/1` (objeto de cadastro), **não** o input do solver.

## Persistência e compatibilidade

- `Project.workspace.spatialPreparation?: SpatialPreparation` é opcional, versionado internamente com `version:1`. O snapshot do usuário permanece na versão **4**, sem alterar os contratos legados `jpn.truss/1`, `jpn.frame3d/1` ou arquivos de orçamento.
- Materiais existentes admitem `material.physicalDeclaration?` com dados físicos reaproveitáveis. Perfis para a visualização 3D e parâmetros físicos permanecem **campos separados**; nenhuma mudança no renderizador ou preenchimento automático de E/G/J.
- O cadastro é salvo no projeto via DataProvider e entra no backup/exportação e nas revisões existentes. Um projeto sem o campo opcional continua válido e as migrações v1/v2/v3→v4 permanecem intactas.
- A `geometrySignature` registra medidas e perfis do projeto. Se a geometria mudar, o editor mostra **Cadastro desatualizado** sem descartar declarações. **Reconhecer nova geometria** apenas troca a vinculação após revisão manual; IDs órfãos continuam listados.
- Para segurança, nenhum valor `null` vira zero, aço padronizado ou restrição em apoio. Um grupo com propriedades declaradas e fonte ainda **não** possui verificação de resistência.

## Contrato interno e pendências para o próximo Codex

- `src/domain/physical-declaration.ts`: esquema compartilhado de propriedades físicas para grupo e catálogo.
- `src/domain/spatial-preparation.ts`: `spatialPreparationSchema`, inicialização sem pressupostos, nós das bases e auditoria de preenchimento.
- `src/components/planning/spatial-preparation-panel.tsx`: edição por controles móveis e cópia de dados físicos; habilitado por `project-workbench.tsx`.
- `src/domain/workspace.ts` e `src/domain/project-details.ts`: persistência opcional, sem reescrever dados antigos.

**Missão de engenharia seguinte:** transformar esses dados revisados, por **grupos de peças**, em solicitações físicas `jpn.frame3d/1` mediante:
- resolução explícita de encontros de terças com banzos (segmentação) e preservação de IDs das peças;
- representação correta de membros de treliça axial, barras de pórtico e liberações (inclusive a diferença entre ligação de solda/parafuso e hipótese de rigidez);
- validação do caminho de cargas, apoios, peso próprio e contraventamentos; nada pode ser presumido pelo programa;
- análise de limites do motor atual (100 nós/200 barras) frente à geometria padrão da entrada rápida, que já pode superar esses limites;
- verificação independente de respostas, desempenho e invalidação de revisão. Só transformar em `analysis_ready` quando todas as hipóteses e requisitos do contrato físico forem atendidos.

**Não** iniciar dimensionamento de aço, verificação normativa, otimização, soldas ou geração de ordem de corte enquanto esse adaptador não demonstrar resultados corretos. A área de preparação e o catálogo possuem dados declarados, não dados certificados.
