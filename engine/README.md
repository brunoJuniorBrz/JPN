# Núcleo experimental de análise JPN

## Módulo espacial experimental — jpn.frame3d/1

O pacote agora inclui um módulo isolado de pórticos espaciais Euler–Bernoulli, executado pelo **PyNiteFEA 3.2.1 (MIT)**, fixado como dependência de runtime. Global Z para cima; SI; dados físicos, fontes, apoios, liberações, casos e combinações explícitos. O contrato 2D e seu solver abaixo permanecem preservados. Não há dimensionamento ou liberação de fabricação.

```sh
python -m jpn_structural.frame3d < engine/examples/spatial-portal.json
python engine/validate.py
```

O serviço existente aceita também `/analyze3d`; o Next usa `POST /api/analysis3d` e `JPN_SPATIAL_ANALYSIS_URL`, mantendo o endpoint/configuração 2D independente. Em hosts sem Python local, configure o serviço remoto privado com HTTPS e `JPN_ANALYSIS_TOKEN`. Limites, sinais físicos, referências analíticas, benchmark de 60 nós/79 barras, inputs/resultados JSON e instruções de interface estão no [relatório espacial](../docs/ENTREGA-MOTOR-3D-EXPERIMENTAL.md). O validador executa as suítes 2D/3D, a campanha histórica e os benchmarks em worker limitado a 20 s.

## Contrato legado — jpn.truss/1

Análise elástica linear de treliças planas articuladas, de primeira ordem e pequenas deformações. Executável Python independente, agora chamado pelo painel técnico de tesoura isolada da v0.6 através de processo local ou serviço HTTP privado. A análise permanece separada do orçamento e os resultados são transitórios. Não faz dimensionamento nem aprova estruturas para construção. Os valores dos exemplos e testes são dados sintéticos de verificação, nunca padrões para uma obra.

## Executar

Python **3.12**, Node **24** para o aplicativo. Na raiz do repositório, com um Python instalado:

```sh
python -m venv .venv
```

Windows, sem ativar scripts PowerShell:

```powershell
.venv\Scripts\python.exe -m pip install -r engine/requirements-validation.lock
.venv\Scripts\python.exe -m pip install --no-build-isolation --no-deps -e ./engine
.venv\Scripts\python.exe -m pip check
.venv\Scripts\python.exe engine/validate.py
Get-Content -Raw engine/examples/triangle.json | .venv\Scripts\python.exe -m jpn_structural
```

Linux/macOS: substituir `.venv\Scripts\python.exe` por `.venv/bin/python`. Para analisar o exemplo:

```sh
.venv/bin/python -m jpn_structural < engine/examples/triangle.json
```

O ambiente portátil preparado nesta auditoria fica em `.tools/` (ignorado pelo Git). Neste computador os comandos equivalentes já funcionam com `.tools/python/python.exe`; no Python embutido do Windows, a instalação usa `--no-build-isolation` por limitação desse runtime. Para instalações regulares, preferir o ambiente virtual acima.

Runtime: `python -m pip install ./engine` instala NumPy, SciPy e PyNiteFEA 3.2.1. PyNite é runtime do módulo espacial e referencial de validação do contrato 2D; pytest continua somente de validação. `requirements-validation.lock` fixa também as dependências transitivas do ambiente testado. Os pacotes nativos dependem de plataforma/BLAS; consulte os checks Windows/Linux do PR para a execução remota.

## Contrato e sinais

`jpn.truss/1`, `units: SI`, campos obrigatórios, sem chaves desconhecidas:

| Coleção | Campos | Significado |
| --- | --- | --- |
| `nodes` | `id`, `x_m`, `y_m` | Coordenadas no plano global XY, em metros |
| `members` | `id`, `start`, `end`, `e_pa`, `area_m2` | E em Pa, A em m², ambos positivos e explícitos |
| `supports` | `node`, `ux_m`, `uy_m` | `null` libera o grau de liberdade; número prescreve deslocamento em m; zero fixa |
| `loads` | `node`, `fx_n`, `fy_n` | Forças nodais em N; entradas repetidas no nó são somadas |

X positivo para a direita, Y positivo para cima; axial positivo em tração e negativo em compressão, independentemente da ordem das extremidades. Reações são forças que o apoio aplica à estrutura; cargas aplicadas diretamente no apoio entram no balanço. Resultados são em m e N; energia em J. Não há conversão implícita de mm, cm², kN, MPa ou kgf.

Resultado `jpn.truss-result/1`: status `analyzed_experimental`, SHA-256 das entradas normalizadas, versões do solver/NumPy/SciPy, hipóteses, deslocamentos e reações de cada nó, comprimentos, extensões, deformações e axiais por barra, diagnóstico numérico. O hash é uma identificação de conteúdo, não assinatura ou prova de aprovação. Alterar a ordem das listas altera o hash; a integração deve guardar também projeto/revisão e compará-los antes de exibir um resultado como atual.

Python: `analyze(dict)` ou `analyze(parse_request(dict))`. Erros levantam `AnalysisError` com código e mensagem. A CLI lê JSON de stdin e devolve JSON em stdout; sucesso retorna código de processo 0; erro retorna 2, sem nós, reações ou esforços fictícios. JSON com chaves repetidas é rejeitado. Limite da CLI: 1.000.000 caracteres; listas limitadas a 200 nós, 1.000 barras, 200 apoios e 1.000 entradas de carga. Os limites são operacionais do protótipo denso, não capacidades estruturais.

## Método e salvaguardas

Para uma barra de comprimento L, direção `(c,s)` e `b=(-c,-s,c,s)`: `k=(EA/L) bᵀb`. A montagem soma matrizes na ordem dos graus de liberdade globais. A partição impõe exatamente `Kff uf = Ff - Kfc uc`, inclusive recalques não nulos. NumPy/SciPy fornecem álgebra linear LAPACK: não há eliminação, inversa ou pseudoinversa escrita manualmente, molas artificiais ou penalidades que estabilizem mecanismos.

O solver equilibra diagonalmente `Kff` e usa `scipy.linalg.solve(..., assume_a="pos")`. Autovalores da matriz equilibrada detectam mecanismos. Pivô espectral mínimo `≤ 10 n ε λmax` é singular numericamente; `cond₂` equilibrado acima de `1e10` ou original acima de `1e12` impede resultado. Em float64, `ε≈2,22e-16`; o limite bruto admite ordem de `2,22e-4` de sensibilidade no pior caso, portanto estes limites **não prometem sete dígitos corretos para toda entrada aceita**. A campanha comparativa possui domínio mais estreito que todo o espaço de entrada.

Forças de extremidade são reconstruídas por barra, verificando equilíbrio em cada nó e equilíbrio global de forças/momento em torno do primeiro nó. Resíduos normalizados pela soma dos módulos das forças aplicadas/internas devem ficar abaixo de `1e-9`; momento usa também o maior vão cartesiano. Não há tolerância absoluta de 1 N que aceite cargas pequenas arbitrariamente. Nós coincidentes ou a menos de `64 ε × escala das coordenadas` são rejeitados, inclusive quando a origem muito distante perde resolução. Valores intermediários/resultados não finitos impedem a saída.

Deformação axial absoluta ou deslocamento absoluto/vão cartesiano acima de **1%** retorna `MODEL_LIMIT`. É uma restrição operacional conservadora do domínio experimental, não limite de serviço normativo nem critério suficiente para primeira ordem. Movimentos rígidos impostos também podem atingir esse limite. Abaixo de 1% ainda podem existir efeitos relevantes de segunda ordem, instabilidade ou falha resistente; não são calculados.

| Código | Condição |
| --- | --- |
| `INVALID_INPUT` | Ausência, tipo/valor inválido, referência desconhecida, duplicatas ou limite de entrada |
| `UNSUPPORTED_MODEL` | Versão ou unidades não suportadas |
| `INVALID_GEOMETRY` | Nós coincidentes/numericamente indistinguíveis ou isolados |
| `UNSTABLE` | Mecanismo interno, grau sem rigidez ou movimento de corpo rígido |
| `ILL_CONDITIONED` | Condicionamento excede o domínio numérico |
| `NUMERICAL_FAILURE` | Rigidez não representável, aritmética não finita ou falha de fatoração |
| `EQUILIBRIUM_FAILURE` | Resíduo de equilíbrio acima do limite |
| `MODEL_LIMIT` | Movimento/deformação excede o domínio linear operacional |

## Referências independentes e tolerâncias

`tests/oracle.py` monta o modelo diretamente na **API instalada do PyNiteFEA 3.2.1**, sem importar montagem ou recuperação de esforços do JPN. `FEModel3D.add_spring(..., ks=EA/L)` representa exatamente uma barra axial bilateral. DZ e rotações são restringidos apenas para embutir o problema XY; os graus XY têm somente os vínculos das entradas. A comparação usa `analyze_linear(sparse=True, check_stability=True)`. `Spring3D.axial` retorna a força local da extremidade i, cujo sinal é convertido: `N_JPN=-N_PyNite`.

Oito testes adicionais usam elementos de pórtico do PyNite com liberações de momento, nos modos esparso e denso. G/I/J são dados sintéticos desse referencial, não propriedades presumidas pelo JPN; suas contribuições à flexão não participam da solução axial articulada. Recalques e três mecanismos também são verificados contra PyNite. Entradas degeneradas são rejeitadas antes da montagem do referencial quando a API não possui validação apropriada; não se usa uma divisão por zero como prova de detecção de instabilidade.

Comparação: `|a-b| ≤ atol + 1e-7 |b|`, com `atol=1e-11 m` para deslocamentos e `1e-5 N` para forças. `1e-11 m` trata zeros próximos da precisão de montagem; `1e-5 N` é pequeno ante as cargas sintéticas de ordem kN. A parcela relativa admite acumulação de arredondamentos nas diferentes montagens e solvers. Esses limites foram definidos antes da campanha; não foram ampliados para fazer os testes passarem. Não se aplica a tolerância comparativa como incerteza física ou admissibilidade de projeto.

Os dois programas usam NumPy/SciPy e podem compartilhar BLAS: concordância não é prova isolada. Evidências complementares:

- Barra: `u=PL/EA`, `N=P`, `R=-P`, tração/compressão e carga muito pequena.
- Triângulo simétrico: estática e deslocamento por trabalho virtual; triângulo assimétrico: reações por momentos.
- Barras em série, recalque imposto com e sem graus livres e cargas diretamente nos apoios.
- Compatibilidade `N=EA ΔL/L`, equilíbrio nodal/global e `2U=F·u+R·uc`, verificadas fora dos diagnósticos do solver.
- Refinamento de barra axial com 1, 2, 4, 8, 16 e 32 elementos: solução exata preservada; isso não demonstra convergência de modelos de flexão ou não lineares.
- Superposição, reversão/divisão de cargas, translação, reflexão, troca de ordem dos nós e extremidades, escala geométrica, escala de rigidez e reciprocidade Maxwell–Betti.
- Sementes 0 a 999, `random.Random(seed)`: quatro famílias com E/A variáveis, triângulos, painéis com e sem redundância, balanços, apoios duplos, rotação de 90° e cargas em todos os nós, inclusive apoios.

`python engine/validate.py` executa toda a suíte e produz `engine/validation-results/pytest.xml` e `validation.json`, com contagem, versões, hashes dos fontes/testes e desvios máximos identificados por semente. Qualquer falha ou teste ignorado impede status aprovado. A workflow `.github/workflows/validation.yml` repete as suítes em CI; sua execução remota ainda não foi observada. Evidência local arquivada em `docs/validation/2026-10-30/` e relatório em `docs/AUDITORIA-MOTOR.md`.

## Fora do domínio do contrato 2D e integração

Sem análise 3D, flexão, torção, excentricidades, ligações semirrígidas, apoio inclinado/mola, material não linear, plastificação, peso próprio automático, cargas distribuídas/temperatura, combinações, dinâmica, flambagem, P–Δ/P–δ, vento, dimensionamento normativo ou otimização. Barras coincidentes/duplicadas são rejeitadas; cruzamento de barras não cria nó automaticamente. Nós interiores a uma barra não a discretizam; sua conectividade depende das extremidades explicitamente cadastradas.

`StructureModel` em TypeScript é um levantamento 3D em mm, não a entrada deste solver. As terças podem tocar banzos fora dos nós dos painéis; pilares não devem ser transformados automaticamente em barras articuladas. Um adaptador terá de escolher o plano, converter mm→m, discretizar pontos de aplicação de carga, definir vínculos e ligações, exigir E/A e fontes rastreáveis e avaliar estabilidade espacial. Perfis livres do catálogo atual não fornecem propriedades resistentes.

Manter módulos separados: geometria/quantitativos TypeScript; análise Python com hash/revisão; futuro `DesignResult` com norma/edição e cada verificação; orçamento com cotações fornecidas. A CLI e o serviço HTTP privado são fronteiras de integração testadas. O adaptador impõe timeout e concorrência limitada. Implantação pública, limites globais, autenticação de usuários e persistência de resultados continuam pendentes; consulte `docs/PREPROJETO.md`.
