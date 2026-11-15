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
hashes de entrada do solver. No ensaio local ↔ WSGI real do #122, a maior
diferença relativa entre grandezas físicas do M50/Ue foi **1,14252e−10**
em `geometry_audit.computed_properties.j_m4`. O remoto retornou
5,706047484690789e−10 m⁴ e o local 5,706047484038863e−10 m⁴.
A diferença absoluta de 6,51926e−20 m⁴ também apareceu entre execuções
locais do Ue. O diagnóstico `differences.j_m4.absolute_difference`
teve o maior delta relativo bruto, **2,59116e−4**, por comparar
resíduos em torno de 2,52e−16 m⁴.

O teste exige erro relativo de até **1e−9** para os números físicos,
com piso absoluto de 1e−21 nas unidades do campo. A comparação usa
o maior módulo dos dois valores como denominador. Para diagnósticos de
subtração, os pisos absolutos são 1e−9 para `refinement.relativeChanges`
e 1e−18 m⁴ para `differences.j_m4.absolute_difference`. Esses limites
se aplicam ao teste de paridade do INT-2.

O `assessmentSha256` muda por vincular o conteúdo completo. Já
`analysisInputSha256` permanece idêntico entre local e remoto, assim
como `input_sha256` para uma requisição de solver idêntica. O
`calculation_input_sha256` ficou idêntico no design direto com os
mesmos bytes. No M50 integrado, o `calculationInputSha256` variou
porque os pedidos de design vinculam o resultado da análise de origem.
O `analysisResultSha256` inclui o tempo da execução e pode variar.

A conferência do Studio do #123, SHA `39af706`, aceitou o overlay
de momento dos resultados remotos do M50 em /2 e /3 lineares e
recusou um hash de entrada obsoleto. O ensaio chamou os validadores
do Studio sobre respostas WSGI reais. O parser do Studio desse SHA
abrange os resultados lineares.
