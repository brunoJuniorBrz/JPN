# Integração funcional do JPN

Base auditada: `main` em `01caa9f2c5fd6f38b2d98769f597d9b73aaee359`. Branch temporária: `integration/jpn-functional-main`.

## Conteúdo absorvido

- PR #49 em `bdf21a3afd6839c80c60d2ad0c07427191f3d382`: merge com ancestralidade preservada, incluindo os 92 commits acumulados de M32/M33/M34. Solvers, contratos, hashes e limites mantidos.
- PR #39/#40: somente alterações exclusivas de interface, navegação por abas, pendências e busca. Nenhum motor antigo foi reinserido.
- PR #47: medição entre nós, conciliada com os controles móveis atuais.
- PR #38: verificadores Python isolados de um parafuso e uma solda plana, exemplos, CLI e testes. Não aprovam ligações completas; novos formulários web desses dois verificadores ficam adiados.
- PR #48: cargas uniformes aditivas `frame3d/2`, verificadas antes da incorporação. A interface principal continua usando o contrato misto existente; um editor independente `frame3d/2` fica adiado.

Os SHAs, bases comuns, commits exclusivos e arquivos auditados estão em `validation/integration/branch-audit.json`. Conflitos de abas e preparação preservaram o catálogo físico atual e o dossiê preliminar M25; o conflito de medição preservou os controles móveis.

## Uso integrado

Em **Novo projeto**, importar JSON estrutural validado ou criar uma cobertura por parâmetros. A importação aceita `jpn.declared-structure/1` ou projeto completo com essa declaração. Preserva a identidade comercial da obra atual; não transforma declarações em aprovação.

No resultado: **Modelo 3D → Engenharia → Preparar e analisar este projeto**. Conferir materiais/seções por barra, tipologia dos elementos, conexões, apoios e cargas explícitas. O modelo declarado usa linhas e coordenadas reais, sem sólidos presumidos. A análise executa a obra salva pela rota e worker existentes. Dados incompletos, instabilidade e executor indisponível continuam bloqueando o cálculo correspondente.

Resultados válidos permanecem disponíveis ao alternar abas. Exportações de entradas, resultados e relatório resistente continuam experimentais. Após reabrir a obra, **Recuperar resultado exportado** reconstrói a entrada atual e verifica versão/hash/rastreabilidade; um arquivo restaurado tem origem numérica explicitamente não comprovada. Alterações físicas tornam o resultado obsoleto e impedem sua reutilização.

Materiais e arquivos de coberturas conservam quantitativos, orçamento, corte preliminar, dossiê, DXF e SVG. Estruturas declaradas exportam JSON e DXF das barras reais; SVG cotado de cobertura não é aplicável.

## Verificação e publicação

Testes novos percorrem importação/backup → persistência → API real → Python → resposta, sem mocks do solver. Modelo declarado: quatro nós/três barras, flecha manual `−0,0125 m`; ao duplicar Iy da primeira barra: `−0,0066666666667 m`. O projeto gerado usa o golden legado congelado e uma cópia importada pelo fluxo real de backup. Há conferência desktop/celular, exportação, restauração e rejeição de resultado obsoleto.

Evidências direcionadas em `validation/integration/`: 52 testes dos recursos paralelos, 110 de compatibilidade de pórticos, 28 do misto/worker, auditoria dos commits e capturas de tela. Estado final das suítes, SHA e links de CI são registrados no PR de integração, para evitar alterar novamente o SHA somente para documentar sua execução.

Vercel: projetos `jpn` e `jpn-structural-engine` auditados. `git.deploymentEnabled.main=false` e a branch de integração desabilitada nos dois arquivos de configuração impedem publicação automática desta consolidação. Não há promoção manual de produção nesta missão. A disponibilidade do executor remoto exige configuração/autenticação existentes; execução local usa `pnpm dev:structural` e os ambientes Python documentados.

Mantidos `NOT_READY_BLOCKED`, `computedStructuralApproval=false` e `fabricationRelease=false`. Sem novos coeficientes normativos, PDFs licenciados, aumento de limites ou liberação para fabricação. Merge condicionado à CI aprovada e ausência de bloqueio crítico; confirmação final no PR.
