# Evidências da integração geral

- `pr-snapshot.json`: os 64 PRs abertos observados antes da candidata, HEADs,
  bases, dependências reais e comparações de patches; nenhuma escrita no GitHub.
- `pr-matrix.json`: rastreabilidade por funcionalidade/arquivo/PR/SHA, estado,
  teste correspondente, blob original e SHA-256 da versão da candidata.
- `PRS.md`: índice humano da matriz completa.
- `ancestry-graph.mmd`: ordem parcial real de ancestralidade dos PRs, com HEADs
  iguais agrupados. Adaptações/cherry-picks são descritos na matriz, não como merges.
- `audit.py`: reproduz e confere ancestralidade, preservação do código/evidências
  e bloqueios de deploy/SCI. Precisa do histórico Git completo.

```text
python validation/integration-general/audit.py
node validation/ufsc-2023/validate-reference.mjs
python validation/geometric-stiffness-audit/kg_reference.py
npx --yes pnpm@12.15.0 exec playwright test tests/e2e/general-integration.spec.ts
```

No Windows, se Git não estiver no PATH, definir `JPN_GIT_EXECUTABLE` com seu
executável. Para HTTP real, usar o ambiente Python 3.12 das dependências travadas
em `engine/`, conforme o lançador local existente. Não é necessário deploy.

`audit.py --record` é uma operação explícita após revisão do inventário; a CI
apenas verifica e nunca regrava a matriz. Hashes de texto normalizam CRLF/LF;
arquivos binários conservam seus bytes. Referências antigas permanecem rotuladas
como pesquisa, não capacidades automaticamente homologadas.

O [relatório](../../docs/INTEGRACAO-GERAL-CANDIDATA.md) contém conflitos,
funcionalidades disponíveis e restrições. A jornada física gera JSONs e capturas
em `.tools/integration-general-runtime/`, publicados pela CI no artefato
`general-integration-browser-evidence`. O relatório do PR registra o SHA e os
resultados finais de todas as suítes.

Base científica reutilizada: [CI #83 push](https://github.com/brunoJuniorBrz/JPN/actions/runs/43081350381)
e [CI #83 PR](https://github.com/brunoJuniorBrz/JPN/actions/runs/43081363434), ambas
aprovadas em `b228070`. As fontes e evidências dessa base foram preservadas.
