# INT-2 — configuração do motor na Vercel

No projeto existente **jpn-structural-engine**, vincule o repositório
`brunoJuniorBrz/JPN`, defina `engine` como Root Directory, Python como
preset e `main` como Production Branch. Preserve o entrypoint `app:app`
do `pyproject.toml` e a versão Python 3.12 do repositório. O deploy Git
aceita a main e as prévias `codex/int-2-*`.
[Configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration)

Cadastre no painel da Vercel os valores de cada ambiente correspondente,
Production ou Preview.

| Projeto | Variável | Valor a configurar |
| --- | --- | --- |
| `jpn-structural-engine` | `JPN_ANALYSIS_TOKEN` | Segredo Bearer privado do servidor. Use credenciais separadas para Production e Preview. |
| `jpn` | `JPN_MIXED_REMOTE_ENABLED` | `1` para habilitar o motor remoto no app. |
| `jpn` | `JPN_MIXED_BACKEND_URL` | Origem HTTPS do engine correspondente, sem caminho, parâmetros ou credenciais. |
| `jpn` | `JPN_ANALYSIS_TOKEN` | Mesmo Bearer do engine do ambiente correspondente. |
| `jpn` | `JPN_MIXED_APP_ORIGIN` | Origem HTTPS exata do app que receberá a requisição. Para prévia, configure a origem usada pelo teste. |
| `jpn` | `JPN_MIXED_ACCESS_USER` | Usuário autorizado a acionar o motor pelo app. |
| `jpn` | `JPN_MIXED_ACCESS_PASSWORD` | Senha privada do operador com pelo menos 16 caracteres, diferente do Bearer. |
| `jpn` | `JPN_MIXED_DEPLOYMENT_BYPASS_SECRET` | Somente se Deployment Protection do engine exigir autenticação adicional para chamadas servidor-servidor. Gere no projeto do engine sob Protection Bypass for Automation. |

Armazene o Bearer, a senha e o segredo opcional como Sensitive.
As rotas do engine exigem Bearer antes de disparar o worker, inclusive
`GET /health`. `POST /api/analyze-mixed` é a rota de cálculo. O opt-in
`JPN_PURLIN_REMOTE_ENABLED` fica desativado para este recorte.

### Consultas remotas

As mesmas variáveis habilitam `section`, `design`,
`structural-assessment` e mixed3d /3 com
`analysis_order: "second-order"` e `solution_mode: "per-combination"`.
O engine instala o perfil de seções com os mesmos pins numéricos do
perfil local. O perfil automático isolado `computed-cfsm-ss` continua
disponível no executor local, com recusa explícita no remoto. A avaliação
integrada usa o mesmo orquestrador de evidências do app.

Em respostas POST bem-sucedidas, compare `X-JPN-Request-Sha256` e os
hashes de entrada do solver. Recibos de execução continuam vinculados
aos resultados que realmente ocorreram. Tempos e hashes derivados do
resultado podem variar entre execuções. Repetições locais do mesmo
Ue também apresentaram variação de cerca de 6,5e−8 mm⁴ em J,
aproximadamente 1,1e−10 em termos relativos.
