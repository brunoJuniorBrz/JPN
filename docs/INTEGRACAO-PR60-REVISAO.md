# PR #60 — integração progressiva do caso Tom

Revisão sobre o commit 28de4cff75985901d9e51499c573dcbd628a1a3e, sem alterar a main e sem avançar a PR #60 automaticamente.

## Incluído nesta branch
- PR #55: assistente para apoio de alvenaria, apoio misto e cobertura parcial; preferência de obra sem inventar apoio físico.
- PR #54: demonstração do Tom, histórico matemático separado, estimativa comercial e exportação PDF.
- PR #57: navegação e roteiro responsivos no celular.
- Preservados link Calcular terças da PR #59 no cadastro de projetos e motor M35 da PR #60.
- Reconciliação em workspace dos dois campos opcionais guidedSupport e demonstration.
- Limpeza de referências de contorno do PR #54, que também cobre a correção do PR #55.

## Fora deste marco
PRs #39/#40 (abas e busca de peças) e #47 (medir entre nós) precisam ser adaptados separadamente no Studio M35. Motor de terças ainda só executa em localhost, mesmo com UI online.

## Verificação obrigatória
CI completa TypeScript, Python, Vitest, Playwright desktop/mobile, build, snapshot visual, segurança, modelos 3D e geração PDFs. Nenhum resultado constitui dimensionamento aprovado ou liberação de fabricação.
