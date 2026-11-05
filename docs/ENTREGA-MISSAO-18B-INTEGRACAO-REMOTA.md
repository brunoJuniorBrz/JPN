# Missão 18B — transporte remoto misto experimental

Base exata: PR #19, `adea5a8d588286427526752a37c3d4db5ed635e6`. Branch `feat/secure-remote-mixed-integration`, PR draft empilhado sobre `fix/vercel-python-mixed-entrypoint`. Data: 2026-11-01. A implementação local está validada; **o cálculo real na Vercel permanece não comprovado**.

## Resultado por etapa

| Etapa | Resultado | Evidência |
| --- | --- | --- |
| 1 — corrigir os dois problemas Vitest | PASSOU | Dois testes falhavam antes; seis testes do adaptador passam depois, inclusive cobertura sem cargas nodais executada pelo Python real. |
| 2 — transporte Next → Python | PASSOU localmente | 20 testes do transporte/rota: HTTP real local, autenticação, hashes, v1/v2, limites, cancelamento, timeout e rejeição de respostas adulteradas. Não equivale a frontend remoto publicado. |
| 3 — health autenticado na prévia Vercel | FALHOU | Uma tentativa, resposta JSON HTTP 401. O segredo obtido pela conexão foi usado apenas em memória; a credencial efetiva do deployment não foi confirmada. Nenhuma repetição. |
| 3 — rejeição sem token, cálculos v1/v2 e cobertura na Vercel | NÃO EXECUTADO | Smoke interrompido no health; não existem tempos de cálculo remoto nem prova numérica remota. |
| 4 — suítes locais | Ver tabela abaixo | Execução completa única depois dos testes direcionados. |
| Navegador/iPhone → frontend Vercel → Python | NÃO EXECUTADO | Exige resolver o acesso ao backend e configurar as variáveis privadas do frontend, sem alterações automáticas nesta entrega. |

**Veredito: entrega parcial para revisão. A missão não está concluída.** O primeiro bloqueio remoto é autenticação HTTP 401; é preciso conferir a credencial efetivamente disponibilizada à prévia. Deployment Protection é outra camada e pode exigir o bypass privado documentado abaixo. Não houve alteração dessa proteção.

## Correções e fluxo

O teste de densidade agora renova explicitamente a revisão das declarações sintéticas para chegar à validação de densidade. Os testes que revogam a revisão após editar cargas, combinações ou densidade continuam presentes. Não se removeu a proteção `POSSIBLE_DOUBLE_COUNT`.

O contrato v2 constrói seu array de cargas nodais a partir do schema do elemento, sem herdar o mínimo de uma carga do v1. No Zod 4, acrescentar `.min(0)` não removia a restrição anterior. `nodal_loads: []` funciona quando peso/carga distribuída atendem às demais validações; v1 continua exigindo cargas nodais e v2 sem ações físicas continua recusado. Nenhuma carga fictícia foi inserida.

Navegador → mesma rota `/api/experimental/mixed3d` → transporte exclusivamente servidor-servidor → `/api/analyze-mixed` → worker protegido e solver existentes. Todos os arquivos Python do motor permanecem idênticos à base. Não se modificaram matemática, tolerâncias, geometria, contratos de resultados ou funcionalidades comerciais.

O modo remoto só funciona com `JPN_MIXED_REMOTE_ENABLED=1`. Sem isso, permanece o executor local e sua restrição loopback. Com modo remoto ativo, falhas nunca acionam fallback local. O envelope remoto é `jpn.remote-mixed/1`, com `transport=remote` e `local_only=false`; a interface existente reconhece a origem, mantendo seus controles de identidade, revisão, cancelamento e invalidação de resultados obsoletos.

O servidor valida os contratos estritos, SHA-256 dos bytes exatos transmitidos, hash canônico, versão, projeto, IDs, unidades, equilíbrio e rastreabilidade de massa/peso. Respostas HTML, inválidas, adulteradas ou excessivas nunca se tornam resultados concluídos. Nenhum modelo completo, Bearer ou bypass é registrado nos logs da integração.

Limites: 500000 bytes de entrada, 2000000 de saída inclusive envelope final; recebimento do corpo em até 5 s; transporte remoto em até 28 s incluindo leitura da resposta; função Next com `maxDuration=35`; navegador cancela em 33 s. O backend mantém 20 s e 768 MiB no worker. Uma consulta por instância Next e uma por instância Python; não é uma cota distribuída. Cancelar descarta a resposta, mas um Python que já começou pode terminar até seu próprio deadline. Não se promete cancelamento remoto instantâneo.

## Configuração privada e acesso do operador

`.env.example` contém somente nomes e valores vazios. Nenhuma variável Vercel foi alterada nesta missão. No projeto frontend existente `jpn`, um responsável deve configurar:

| Variável privada | Finalidade |
| --- | --- |
| `JPN_MIXED_REMOTE_ENABLED` | `1` somente para ativação explícita. |
| `JPN_MIXED_BACKEND_URL` | Origem HTTPS do backend corrigido, sem caminho/query/credenciais. |
| `JPN_ANALYSIS_TOKEN` | Mesmo Bearer efetivo no backend; exclusivamente servidor-servidor. |
| `JPN_MIXED_DEPLOYMENT_BYPASS_SECRET` | Opcional, segredo de automação já autorizado para a proteção da prévia; enviado somente como `x-vercel-protection-bypass`. |
| `JPN_MIXED_APP_ORIGIN` | Origem HTTPS exata da prévia frontend que receberá as consultas. |
| `JPN_MIXED_ACCESS_USER` | Identificador do operador autorizado. |
| `JPN_MIXED_ACCESS_PASSWORD` | Senha própria do operador, pelo menos 16 caracteres e diferente do Bearer Python. |
| `JPN_PYTHON_EXECUTABLE` | Somente para desenvolvimento/testes locais com Python 3.12. |

Nenhum nome usa `NEXT_PUBLIC_`. A flag de ativação não autentica ninguém. Basic Auth do operador é conferido antes de ler o modelo ou iniciar Python, com comparações de hashes de tamanho fixo. A rota valida Host, Origin no POST e Fetch Metadata; não oferece CORS permissivo. Exige HTTPS em produção. HTTP loopback do backend é permitido somente em `NODE_ENV=test`, para o teste de transporte real local.

Para usar o fluxo existente no navegador: visitar primeiro **a mesma origem frontend** em `/api/experimental/mixed3d`, autenticar no diálogo nativo do navegador com o usuário/senha do operador, voltar à obra e clicar em verificar o executor. A visita direta somente confirma o acesso, sem iniciar Python; o health real exige o header não simples `X-JPN-Request: 1`, enviado pela interface. Isso evita disparar health a partir de imagens/links externos com credenciais em cache. A credencial conhecida pelo navegador é a do operador; nunca é o Bearer Python nem o bypass.

Este é um acesso compartilhado de operador para uso experimental, sem gestão de contas/sessões individuais ou limite agregado entre instâncias. O diálogo e o cache de Basic Auth no Safari de iPhone físico **não foram comprovados**. No modo remoto, usar a credencial em HTTPS e fechar a sessão de navegação após o uso.

URL de referência fornecida para a prévia Python, não embutida na configuração:
`https://jpn-structural-engine-git-fix-v-00724f-brunos-projects-45ed18ac.vercel.app`

Não usar o domínio de produção antigo como equivalente. A consulta somente leitura confirmou o deployment corrigido READY, de origem Git, no SHA da base. Os projetos existentes possuem publicação automática por Git: o único push final pode gerar prévias automaticamente. Não foi feito deploy manual, promoção, alteração de projetos ou merge.

## Smoke HTTP reproduzível no PC

No PowerShell, usar o ambiente Python 3.12 existente com `engine[validation]`. Definir a URL acima em `JPN_MIXED_BACKEND_URL` e carregar `JPN_ANALYSIS_TOKEN` e, se necessário, `JPN_MIXED_DEPLOYMENT_BYPASS_SECRET` no ambiente de forma privada. Não inserir segredos em argumentos, URLs, arquivos do repositório ou histórico do terminal. Executar:

```powershell
python scripts/smoke-mixed-remote.py --output smoke-mixed-result.json
```

O script não publica, não segue redirects e não repete falhas. Verifica health/dependências reais, rejeição sem Bearer, v1 e v2 pequenos e só depois a cobertura sintética de 132 nós/243 segmentos. Cada modelo é executado duas vezes, com duração separada. Primeira/segunda chamada não garantem mesma instância nem cold/warm start. `--skip-roof` permite validar primeiro apenas os casos pequenos. Ausência de configuração retorna código 2/NÃO EXECUTADO; falha retorna 1; sucesso retorna 0. O relatório contém somente métricas/hashes/diagnósticos sanitizados, nunca segredos ou modelos.

Referências independentes dos casos pequenos (E=200 GPa, I=10⁻⁵ m⁴, L=2 m):

- v1: balanço com barra axial vertical em paralelo. `uZ = -1000 / (3EI/L³ + EA_axial/L_axial)`, reação vertical total 1000 N e momento do engaste obtido pela parcela da força do balanço vezes L.
- v2: barra axial horizontal, peso sintético declarado de 1000 kg/m³, gZ=-10 m/s². Massa 21 kg; peso 210 N; balanço recebe q=100 N/m e a metade do peso axial P=5 N na ponta. `uZ = -qL⁴/(8EI) - PL³/(3EI)`, momento do engaste -210 N·m; no meio, My=55 N·m e Vz=-105 N. A combinação com mais 100 N/m verifica superposição. Não são propriedades de uma obra real.

Essas referências foram verificadas no teste Next → HTTP WSGI → Python real **local**, separado dos mocks usados para injetar falhas de rede/integridade. Mocks não constituem evidência de cálculo na Vercel. A cobertura é um ensaio sintético de pórticos/axiais, sem homologação estrutural comercial.

## Testes e evidências

| Comando | Resultado efetivo |
| --- | --- |
| Vitest direcionado (adaptador, transporte e executor local) | 28 aprovados, 0 falhas; o teste adicional de preserva??o v1/recusa v2 sem a??es entrou depois e passou na su?te completa. |
| `python engine/validate.py` | 1441 aprovados, 0 falhas/erros/skips; 1000 compara??es adicionais e benchmarks aprovados; 65,08 s no total. Python 3.12.10, NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1, BLAS/OMP/MKL com uma thread. |
| `pnpm typecheck` | PASSOU, c?digo 0. |
| `pnpm lint` | PASSOU, c?digo 0. |
| `pnpm test` | 195 aprovados, 0 falhas/pend?ncias, incluindo 20 testes de transporte/rota. |
| `python tests/verify_dxf.py` | PASSOU; ezdxf 1.4.5: 130 linhas 3D, mm, nenhum erro de auditoria; executado depois do Vitest e antes da limpeza do Playwright. |
| `pnpm test:e2e --reporter=json` | 56 aprovados, 0 falhas/skips/flaky; 241,82 s. Chromium, incluindo 375/1440 px, cria??o r?pida, Perfis 3D, Acabado, quantitativos/or?amento, DXF/PDF/planilhas, persist?ncia/backups, 2D e misto real local. |
| `pnpm build` | PASSOU, c?digo 0; rota experimental din?mica Node presente. |
| `python scripts/smoke-mixed-remote.py` contra a pr?via Vercel | FALHOU no health autenticado HTTP 401; demais est?gios N?O EXECUTADOS. |

As su?tes completas foram executadas uma ?nica vez nesta entrega. Nenhuma falha final local foi omitida. Evid?ncia de navegador ? Chromium com viewports/touch emulados, n?o Safari/iPhone f?sico. Nenhum teste com mock ? apresentado como prova remota.

Evidências sanitizadas em `docs/validation/mission18b/`. A baseline direcionada registrou as duas falhas conhecidas antes da correção. A validação remota foi interrompida no primeiro HTTP 401; não se investigaram runners/faturamento/CI externa nem se repetiram deploys. Linux/Vercel numérico e iPhone físico continuam pendentes.

O JPN permanece experimental, sem dimensionamento normativo homologado e sem autorização para fabricação.
