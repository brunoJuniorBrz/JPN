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

## Extra opcional `sections` e tamanho do pacote Python

`sectionproperties`, `cytriangle` e `shapely` saíram das dependências obrigatórias de `jpn-structural` e viraram o extra
`jpn-structural[sections]` (`engine/pyproject.toml`). Motivo: o job `structural` do CI instala só o lock de validação e roda `pip check`;
dependências obrigatórias não instaladas o reprovavam. As rotas que precisam do extra
(`jpn.section-analysis/1` fora do caso I simétrico, `jpn.verified-coldformed/1` e `-batch/1`) **recusam** com `SECTIONS_EXTRA_MISSING`
(HTTP 503, sem resultado) quando ele falta; o app repassa o código com mensagem clara. O projeto I/H fechado (`steel-design`) e o mixed3d
não dependem do extra.

### Tamanho medido (wheels Linux x86_64, CPython 3.12, fechamento transitivo, conteúdo descompactado)
| Instalação | Pacotes | Descompactado | Wheels (compactado) |
|---|---|---|---|
| Base (`numpy`, `scipy`, `PyNiteFEA` + dependências) | 15 | **250,5 MB** | 78,1 MB |
| Base + extra `sections` | 40 | **300,1 MB** | 92,6 MB |
| Diferença do extra | +25 | +49,6 MB | +14,5 MB |

Maiores itens da base: scipy 111,9 MB, numpy 56,4 MB, matplotlib 25,0 MB, fonttools 23,1 MB, pillow 20,4 MB (estes três vêm do `PyNiteFEA`).
O extra puxa dependências pesadas e desnecessárias em tempo de execução (ipython/ipywidgets/jedi, rich, psutil: cerca de 40 MB).

### Comparação com o limite de função da Vercel
- O limite clássico de função é de **250 MB descompactados**: a **base já está no limite (250,5 MB)**; com o extra passa de 300 MB.
- A Vercel documenta um limite maior para funções Python (500 MB descompactados, a confirmar no painel/documentação vigentes): nesse caso a base cabe com folga
  e a base + extra (300,1 MB) também cabe.
- Não foi feito deploy: o tamanho final depende do que o builder da Vercel exclui/deduplica. Medição feita com `pip download --platform manylinux…` e soma
  de `ZipInfo.file_size`; não inclui o código do engine (pequeno) nem o interpretador.

### Como instalar o extra no deploy do engine (decisão do dono)
Por padrão o deploy do engine **não** instala o extra (as rotas de seção/NBR 14762 respondem `SECTIONS_EXTRA_MISSING`). Para habilitá-las, defina no projeto
`jpn-structural` da Vercel o **Install Command** `uv sync --frozen --extra sections` (ou equivalente) e confira o tamanho do deploy. Redução possível,
não aplicada: excluir `matplotlib`/`fonttools`/`pillow` (não usados pelo solver) com `excludeFiles` em `engine/vercel.json`, e restringir as dependências do extra.
