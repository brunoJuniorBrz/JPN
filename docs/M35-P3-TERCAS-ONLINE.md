# M35-P3 — Transporte remoto protegido da calculadora de terças

## Escopo
Este PR adiciona **apenas o transporte remoto** da análise elástica de terças. Não altera fórmulas, não calcula ações normativas, não otimiza perfis resistentes e não libera compra/corte/fabricação. A tela ainda exige declarar cargas, geometria, referência da pressão e parâmetros físicos. A opção local continua disponível pelo comando `pnpm dev:structural`.

## Segurança e isolamento
- Nova rota Python WSGI `POST /api/analyze-purlin`, negada por padrão (404) até `JPN_PURLIN_REMOTE_ENABLED=1` **no backend**. Exige o bearer privado `JPN_ANALYSIS_TOKEN`.
- O executor numérico existente roda via subprocesso Python isolado com memória de 768 MiB, limite de 20 segundos, saída limitada e apenas uma análise simultânea por instância. Não cria um novo solver.
- No frontend Next.js, a rota `/api/experimental/purlin` só usa o transporte remoto com **ambas** as flags privadas `JPN_PURLIN_REMOTE_ENABLED=1` e `JPN_MIXED_REMOTE_ENABLED=1`. O acesso do operador usa autenticação Basic da infraestrutura existente, origem HTTPS e verificação de host/origin.
- Limite de solicitação: 25 kB; limite de resposta remota: 200 kB. SHA-256 do payload, request_id, quantidade e ordem de candidatos, composição das cargas e resultados checados novamente antes de exibir valores.
- Flag desligada não faz fallback público, mantém `LOCAL_ONLY`; não publicamos dados/credenciais no JavaScript do navegador.
- Resultados obrigatoriamente com `computedStructuralApproval=false` e `fabricationRelease=false`.

## Configuração de uma prévia protegida
Não reutilizar automaticamente variáveis de produção. Configurar via Vercel Settings, em **ambos** os projetos, apenas no escopo da branch de testes:
1. Backend `jpn-structural-engine`: `JPN_PURLIN_REMOTE_ENABLED=1` e `JPN_ANALYSIS_TOKEN` configurado de forma criptografada.
2. Frontend `jpn`: `JPN_PURLIN_REMOTE_ENABLED=1`, `JPN_MIXED_REMOTE_ENABLED=1`, `JPN_MIXED_BACKEND_URL` apontando para a prévia HTTPS protegida, `JPN_ANALYSIS_TOKEN` consistente com backend e `JPN_MIXED_APP_ORIGIN` sendo a URL exata da prévia.
3. Definir no frontend `JPN_MIXED_ACCESS_USER` e uma senha `JPN_MIXED_ACCESS_PASSWORD` forte e diferente do bearer; se houver SSO de proteção backend, configurar `JPN_MIXED_DEPLOYMENT_BYPASS_SECRET` apenas no servidor.
4. Não expor `NEXT_PUBLIC_` para nenhum segredo. Validar o SSO Vercel e a autenticação do operador abrindo `/api/experimental/purlin` antes dos testes em `/tercas`.

Essas variáveis são propositadamente ausentes nesta branch; **build READY não é prova de cálculo remoto funcionando**. Ativar só após CI e testes reais de HTTP numa prévia protegida.

## Critérios de aceite
Executar testes de transporte WSGI/Python e contratos TypeScript, `pnpm typecheck`, lint, Vitest, Playwright mobile/desktop, build. Confirmar recusa por 401/403/404, timeout, resposta adulterada, cancelamento e ausência de liberação estrutural. Não mesclar sem testes completos e revisão de engenharia.
