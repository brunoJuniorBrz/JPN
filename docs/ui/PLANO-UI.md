# Plano de modernização da interface do JPN

> Prompt original, salvo na íntegra para as próximas sessões.

Você vai modernizar a interface do JPN (repo brunoJuniorBrz/JPN, branch main), sistema web de cálculo de coberturas e galpões metálicos. Usuários: eu (Bruno) e o Tom, engenheiro e construtor, no computador e no celular.

OBJETIVO
Transformar a tela do projeto num estúdio simples: 3D fixo no centro, etapas à esquerda, inspetor contextual à direita, barra de status embaixo. Menus interativos, 3D mais útil e realista, dados ao vivo. O motor de cálculo não muda.

PRIMEIRA TAREFA DESTA SESSÃO
1. Salve este prompt inteiro em docs/ui/PLANO-UI.md (as próximas sessões vão ler dele).
2. Execute a F0.

CONTEXTO (não redescubra)
- Stack: Next 16.4 App Router (leia em node_modules/next/dist/docs só o guia da API que usar; ver AGENTS.md), React 19.3, TypeScript strict, Tailwind 4 + CSS próprio em src/app/globals.css (742 linhas, variáveis em :root), three 0.187 imperativo, lucide-react, zod, pnpm, Node 24.
- Tela do projeto: src/app/projetos/[id]/page.tsx -> components/projects/project-editor.tsx -> components/planning/planning-editor.tsx (etapas Obra/Medidas/Estrutura/Resultado; URL ?etapa=0..3 e ?vista=3d) -> no Resultado: planning/takeoff-summary.tsx (seções model|materials|engineering|files) + planning/project-workbench.tsx (select de ferramentas) -> planning/mixed-analysis-workspace.tsx (47 KB: preparação, execução Python via /api/experimental/mixed3d com job e polling, resultados, camadas, painéis de resistência e ligações).
- 3D: planning/structure-3d.tsx (42 KB) + profile-scene.ts, studio-stage.ts (PBR, RoomEnvironment, sombras, tone mapping), studio-view.ts, studio-result-overlay.ts, presentation-scene.ts. Já tem render sob demanda, InstancedMesh, raycaster, corte, medição, fantasma, deformada, cores de análise e viewerQuality para aparelho fraco. ESTENDA; não reescreva nem migre para react-three-fiber.
- Shell: components/app-shell.tsx. UI base: components/ui.tsx (Field, Input, Select, PageHeading, Status).
- Persistência: localStorage (components/data-provider.tsx). Não mexa.

REGRAS INVIOLÁVEIS
1. Não alterar src/domain, src/infrastructure, engine/ nem lógica normativa. A interface só consome.
2. Manter computedStructuralApproval=false, fabricationRelease=false e NOT_READY_BLOCKED. Nenhum aviso de segurança ou limitação pode sumir: pode mudar de lugar (painel de pendências, dica), nunca deixar de estar acessível. O estado "bloqueado para fabricação" fica sempre visível na tela do projeto.
3. tests/e2e tem cerca de 1.470 seletores (getByRole, getByLabel, getByTestId, getByText) e 21 screenshots. Preserve nomes acessíveis e data-testid. Se uma mudança estrutural exigir mudar um teste, mude no mesmo commit e explique em uma linha no PR. Baselines de screenshot só no fim da fase.
4. Acessibilidade: teclado, foco visível, aria. Menus com primitivas acessíveis.
5. Celular em 390 px funcionando em toda fase.
6. Dependências novas permitidas: radix-ui (primitivas) e cmdk. Pós-processamento só com three/addons. Nada de kit de UI pesado.
7. Um PR por fase a partir da main, CI verde, sem merge (eu integro), push sem force.

COMO TRABALHAR (economia de tokens)
- Não explore além do necessário: use rg e leia trechos. Não leia arquivos acima de 15 KB inteiros.
- Primeiro mova painéis existentes para o layout novo; só reescreva o que a fase pedir.
- Durante a fase, rode só os testes afetados. No fim: pnpm typecheck, lint, test e test:e2e uma vez.
- Decida detalhes de design sozinho e registre em docs/ui/DECISOES.md (curto). Só pergunte se for quebrar uma regra.
- Relatório final de até 15 linhas: PR, o que mudou, testes alterados e por quê, pendências.

FASES (faça só a que eu pedir)
F0 Base de design: tokens (cor, espaço, raio, tipografia), fonte Inter via next/font, componentes em components/ui/: Button, IconButton, Tabs, Menu, ContextMenu, Dialog, Sheet, Tooltip, Badge, Kbd. Nenhuma tela muda de estrutura. Criar docs/ui/PADROES.md curto. Aceite: CI verde, telas iguais exceto fonte e tokens.
F1 Shell do estúdio: ProjectStudio com etapas à esquerda (Obra, Geometria, Estrutura, Cargas, Análise, Verificação, Materiais, Arquivos), viewport 3D fixo, inspetor à direita, barra de status. Painéis atuais entram nas etapas como estão; acaba o select "Ferramenta de engenharia" e as abas aninhadas. No celular: etapas em barra inferior, inspetor em Sheet. Aceite: qualquer ferramenta em até 2 cliques; 3D não sai da tela ao editar; URLs antigas funcionam; e2e verdes.
F2 Seleção e inspetor: clique e hover no 3D (raycaster existente); inspetor de peça (perfil, comprimento, massa, N/V/M da combinação ativa, utilização, status), nó e apoio (reação, arrancamento, pendências); selects de peça, segmento e nó viram busca no inspetor. Aceite: selecionar uma peça e ver os esforços sem rolar a página.
F3 Resultados no 3D: barra de cores com escala, seletor de combinação no viewport, apoios com ícone de status, rótulos de ID e cota (CSS2DRenderer), deformada com escala animada, cubo de orientação (ViewHelper). Aceite: legenda gráfica com texto alternativo; status do arrancamento visível nos apoios.
F4 Dados ao vivo e selo: totais (peças, kg, m, R$) ao vivo na barra; estado da análise (atual, desatualizada, rodando há N s, usando o progresso do job existente); botão único Recalcular; selo "Bloqueado para fabricação" que abre o painel de pendências agrupadas (normativas, dados faltando, revisão do engenheiro); avisos locais viram ícone com dica. Aceite: totais atualizam em menos de 200 ms; selo em todas as telas do projeto; nenhum aviso inacessível.
F5 Realismo e menus: menu de contexto no 3D (isolar, ocultar família, medir daqui, ver esforços, editar perfil); Ctrl+K com cmdk; contorno de arestas e GTAO só no modo apresentação; aço pintado e galvanizado, telha ondulada, paredes existentes e piso. Aceite: fluido no exemplo do galpão num computador comum; celular fraco com qualidade reduzida.
F6 Polimento: página inicial, lista de projetos, menu "Ferramentas avançadas" (exemplos, referência do Tom, experimentais), estados vazios com ação, tour curto, tema escuro. Aceite: revisão visual em desktop e celular; screenshots atualizadas.
