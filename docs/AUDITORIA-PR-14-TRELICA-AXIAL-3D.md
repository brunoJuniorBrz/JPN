# Auditoria do PR #14 — treliça axial espacial isolada

**Veredito: APROVADO COM RESSALVAS como protótipo isolado experimental, após a correção numérica descrita abaixo.** Não habilita análise de obras, modelo misto axial/pórtico, interface, HTTP, dimensionamento ou fabricação. Sem merge e sem deploy.

Auditoria em 31/10/2026. Branch `feat/isolated-axial-truss3d-prototype`; commit inicial `fc7d7c5ccceb834fb080af5d139f496bb43dd93f`, base do PR `537f82089ff1aff44e6acba9b9947c37fd8849e6`. O conteúdo de `engine/` foi obtido pelo SHA do PR em cópia isolada `.tools/truss3d-audit`, preservando a main e os demais trabalhos. Os helpers importados são os reais do repositório; nenhum substituto local foi usado.

## Ambiente e escopo

Python **3.12.10**, NumPy **2.5.4**, SciPy **1.18.1**, PyNiteFEA **3.2.1**, pytest **9.2.0**, Windows 10. Dependências reais já configuradas; instalação editável do engine auditado com `--no-build-isolation --no-deps`, sem modificar as versões. `pip check` aprovado. BLAS controlado com `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`.

A auditoria concentrou-se no motor novo, nos contratos e nas referências físicas. Não foi executada suíte TypeScript/UI, build web, deploy, modelo misto, CI remota ou investigação de infraestrutura. A validação Python existente foi executada uma vez após os testes direcionados, incluindo os motores anteriores.

## Achados e alterações mínimas

| ID | Gravidade | Evidência | Correção / estado |
| --- | --- | --- | --- |
| M1 | Média — robustez numérica | A estabilidade era avaliada em `S⁻¹ Kff S⁻¹`, mas `solve` recebia `Kff` sem equilíbrio. Três barras ortogonais independentes, com rigidezes 1e−7, 2e9 e 1e16 N/m e solução exata u=(1e−8,1e−8,1e−8) m, têm condição escalada 1. A resolução original emitiu `LinAlgWarning` com rcond≈1e−23 e **falhou na política real de warnings como erros do projeto**. Não foi demonstrado erro de sinal ou deslocamento nessa matriz diagonal; o defeito comprovado é a incoerência de escalonamento e a falha da validação numérica em entrada válida. | **Corrigido:** resolver o mesmo sistema equilibrado usado na checagem espectral e recuperar u por escala inversa. Não foram alterados elemento axial, vínculos, cargas, limites ou tolerâncias. O teste passou e conferiu também com PyNite. |
| B1 | Baixa — reprodução | A documentação referia `engine/examples/truss3d-bar.json`, ausente no PR inicial. | **Corrigido:** fixture explícita versionada, com o mesmo caso analítico de barra já existente; o round-trip CLI agora lê esse arquivo real. |
| R1 | Ressalva operacional | A CLI é local e isolada: tem limite de entrada de 500 kB e limites de entidades, mas não possui timeout próprio ou cota rígida de RSS. Não herda automaticamente as proteções HTTP/worker do contrato de pórticos. | **Mantida no escopo isolado.** O experimento de auditoria foi envolvido em subprocesso com timeout de 20 s. Isso não é proteção incorporada ao novo motor. Nenhuma exposição pública foi feita. |

Os **27 testes originais passaram** antes das alterações no Python real. A bateria adicional reproduziu **1 falha e 28 aprovações** antes da correção M1; essa falha foi preservada nos relatórios. Após a correção e a ampliação dos casos adversariais, **63/63 testes direcionados passaram**. Nenhuma falha foi ocultada, ignorada ou marcada como skip.

Alterações de produção: apenas a chamada de solução e um comentário em `truss3d.py`. Os motores `solver.py`, `frame3d.py`, contratos anteriores e serviço HTTP não foram modificados. Demais alterações são testes, referência independente, fixture CLI, utilitário de auditoria e documentação.

## Revisão da formulação

Para cada barra i→j, com L>0, vetor unitário d=(xj−xi)/L e deslocamentos globais ue=[ui,uj]:

```
b = [−dx, −dy, −dz, dx, dy, dz]
ΔL = b ue
ε = ΔL/L
N = (EA/L) ΔL       (positivo = tração)
Ke = (EA/L) bᵀb
```

`Ke` é simétrica, semidefinida positiva e de posto 1. Translação rígida produz ΔL=0; não há flexão, torção ou rotações nodais. A montagem usa índices 3i+[0,1,2] e acumulação dos blocos, sem propriedades ou rigidezes resistentes implícitas. Trocar i/j troca simultaneamente d e a ordem dos deslocamentos, preservando ΔL e N.

Os graus fixos têm deslocamento prescrito zero; os demais são livres. Não há suporte a recalques, molas de apoio ou momentos nodais neste contrato estrito. Graus transversais sem rigidez não são suprimidos automaticamente: provocam `UNSTABLE`. Reações são recuperadas por Ku−F; valores nos graus livres são resíduos numéricos, que também entram na checagem de equilíbrio.

A correção usa S=diag(sqrt(diag(Kff))):

```
K̂ = S⁻¹ Kff S⁻¹
f̂ = S⁻¹ Ff
K̂ v = f̂
uf = S⁻¹ v
```

Isso é mudança de escala equivalente, não estabilização artificial. Permanecem os critérios espectrais `λmin ≤ 10 n εmáquina λmax` → `UNSTABLE` e condição escalada >1e10 → `ILL_CONDITIONED`. Os testes com direções quase dependentes em ε=1e−5 e 1e−7 continuam recusados como `ILL_CONDITIONED` e `UNSTABLE`, respectivamente.

## Referências independentes e PyNite

`engine/tests/truss3d_reference.py` monta diretamente um modelo **PyNiteFEA 3.2.1 com Spring3D bilateral ks=EA/L**, sem importar a montagem ou recuperação de esforços do protótipo. Não usa pórticos com liberações como substituto da barra axial. Os graus rotacionais da API de seis graus do PyNite são inativos para Spring3D e fixados somente na referência para remover esses graus sem rigidez. **Nenhum vínculo translacional XYZ é acrescentado ao modelo declarado.** O protótipo JPN continua tendo apenas três translações por nó.

PyNite retorna a ação axial local na extremidade inicial com sinal de compressão positivo; a referência converte explicitamente `N_JPN = −Spring3D.axial`. A bateria nova realiza 21 montagens/comparações válidas com a biblioteca real: X/Y/Z, ambos os sinais e sentidos de barra; barra oblíqua; tripé com tração/compressão simultâneas; tetraedro não coplanar; transformação espacial com translação/rotação e inversão das barras; contraste de rigidezes.

Tolerâncias de comparação com PyNite: rtol=1e−8, atol=1e−12 m para deslocamentos e 1e−6 N para forças/reações. Referências fechadas usam rtol=1e−12, com tolerâncias absolutas explicitadas nos testes. Não se ampliou tolerância para corrigir uma falha.

### Barra simples e barra oblíqua

Além de δ=PL/(EA), N=P e R=−P nos três eixos, foi testada a barra (0,0,0)→(1,2,3) m, A engastado translacionalmente e B livre somente em X. Para Fx=±1000 N, L=√14 m:

```
uBx = Fx L³/(EA)
N = Fx L
RA = −Fx [1,2,3]
RB = Fx [0,2,3]
```

Esse caso verifica acoplamentos fora da diagonal e reações transversais, evitando validar apenas barras alinhadas aos eixos. Ambos os sinais e a orientação reversa passaram, inclusive contra PyNite.

### Tripé espacial com solução fechada

Três bases engastadas translacionalmente em um círculo de raio r=1 m no plano Z=0, espaçadas de 120°. Nó superior em (0,0,h), h=2 m, L=√5 m; E=200 GPa e A=0,01 m² em todas as barras. Força declarada no topo (900,−300,−600) N.

Por simetria e equilíbrio das componentes, sem montagem de matriz de rigidez na referência:

```
ux = 2 Fx L³/(3 EA r²)
uy = 2 Fy L³/(3 EA r²)
uz = Fz L³/(3 EA h²)
Ni = L/3 [Fz/h − 2(Fx xi + Fy yi)/r²]
Ri = −Ni di
```

| Grandeza | Referência analítica |
| --- | ---: |
| ux do topo | +3,35410196625e−6 m |
| uy do topo | −1,11803398875e−6 m |
| uz do topo | −2,79508497187e−7 m |
| N0 | −1565,24758425 N, compressão |
| N1 | +834,511930121 N, tração |
| N2 | +59,9152608792 N, tração |

Erro máximo observado frente à referência fechada: **1,28e−21 m** e **5,69e−13 N**. Também foram comparadas reações, energia `Σ N ΔL/2 = F·u/2` e equilíbrio global por soma independente de forças e de r×F. Inversão do carregamento, proporcionalidade e invariância por rotação/translação passaram.

Valores registrados pelo utilitário de auditoria, em relação a PyNite:

| Caso | Máx. diferença de deslocamento | Máx. diferença de reação | Máx. diferença de axial |
| --- | ---: | ---: | ---: |
| Tripé | 8,48e−22 m | 3,42e−13 N | 3,42e−13 N |
| Tetraedro | 5,30e−23 m | 3,42e−13 N | 1,14e−13 N |

## Estabilidade, equilíbrio, vínculos e degenerações

Verificados: ausência de apoio lateral, movimento de corpo rígido com diagonais positivas, mecanismo interno ao retirar uma barra do tetraedro, tripé coplanar sem rigidez normal, direções quase dependentes, nós coincidentes, barras sobrepostas/duplicadas, nó órfão, contato interior não segmentado e cruzamento sem nó declarado.

Entradas com suporte repetido, grau pendente, seis graus em vez de três, momento nodal, nó inexistente, fonte vazia, unidade incorreta, área NaN, E infinito ou inteiro fora do domínio são recusadas. A CLI também recusa chaves JSON repetidas, constantes não finitas e corpo acima de 500 kB, sem publicar forças/deslocamentos parciais.

Os limites originais de 100 nós, 240 barras, 100 apoios e 300 cargas foram preservados. Coordenadas ±10000 m, comprimentos de 1e−5 a 1000 m, E/A positivos e limitados. O hash inclui caso, fontes, revisão, geometria, propriedades, vínculos e cargas. Deformações/deslocamentos acima do domínio operacional e resíduo relativo de equilíbrio acima de 1e−8 continuam bloqueados. Não são critérios normativos de segurança.

## Execuções e resultados

| Comando | Resultado | Aprovados | Falhas | Observações |
| --- | --- | ---: | ---: | --- |
| `python -m pip check` | PASSOU | Dependências reais | 0 | Sem requisitos quebrados. |
| `python -m pytest engine/tests/test_truss3d.py -q` — baseline | PASSOU | 27 | 0 | Antes de corrigir o protótipo; Python 3.12 real, sem stubs. |
| `python -m pytest engine/tests/test_truss3d_audit.py -q` — adversarial inicial | FALHOU | 28 | 1 | M1 reproduzido; log e XML preservados. |
| `python -m pytest engine/tests/test_truss3d.py engine/tests/test_truss3d_audit.py -q` | PASSOU | 63 | 0 | Inclui casos adicionais de acoplamento, estabilidade e referência PyNite. |
| `python engine/validate.py --output-dir ../axial-full-python` | PASSOU | 1340 + campanha 1000 casos 2D | 0 | Sem erros ou skips; pytest 30,22 s; validação total 45,59 s. |
| `python engine/audit_truss3d.py` | PASSOU | Referências + benchmark 100/235 | 0 | Uma thread BLAS, invólucro de auditoria com timeout de 20 s. |

Os 1340 testes incluem os 63 direcionados; não são contagens aditivas. A validação completa cobre os **1277 testes anteriores** de treliça 2D, pórtico espacial, serviços e adaptador, além do protótipo. A campanha adicional de 1000 casos da treliça 2D e os benchmarks espaciais existentes também passaram. Os arquivos dos motores anteriores foram preservados byte a byte.

## Desempenho medido

Fixture sintética: grade conectada com **100 nós, 235 barras e 100 apoios declarados**, com Y/Z restritos em todos os nós e X restrito no início de 20 cadeias paralelas. São **80 graus livres**, não o pior caso possível. Cargas de 1000 N em X nas extremidades; deslocamento analítico final de cada cadeia de oito metros =4e−6 m. Não se inferem contraventamentos de uma obra real: todos esses vínculos estão explicitamente no experimento.

- Tempo com tracemalloc: **2,994 s**.
- Pico Python rastreado: **1.575.307 bytes**; pico RSS do processo de auditoria, incluindo bibliotecas/referências previamente carregadas: **91.975.680 bytes**.
- Condição escalada: **25,27414237**; resíduo relativo: **5,97e−16**.
- Entrada/saída JSON medidas: **47.160 / 34.218 bytes**.
- Hash da fixture: `dd068af08054d12c0205383ec1eb9e3a85d4c6a70c0ab8c6f3db228590ff2bd3`.

Esses números medem esse caso, não certificam todas as topologias ou todos os hardwares. O benchmark não exerce o máximo possível de graus livres. Não há proteção temporal/RSS nova adicionada ao motor.

## Evidências e limites do veredito

Relatórios brutos, fase vermelha, XMLs, referências numéricas, versões e checksums em `docs/validation/2026-10-31-truss3d-audit/`. Reprodução:

```sh
python -m pytest engine/tests/test_truss3d.py engine/tests/test_truss3d_audit.py -q
python engine/validate.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python engine/audit_truss3d.py
python -m jpn_structural.truss3d < engine/examples/truss3d-bar.json
```

Em PowerShell use `$env:NOME='1'` para as variáveis; o round-trip do teste CLI usa `subprocess` com bytes, evitando diferenças de redirecionamento entre shells.

Não foram executados Linux, UI, deploy, validação normativa, modelo misto, instabilidade não linear, flambagem ou testes de produção. Compressão negativa aqui representa somente esforço axial de primeira ordem, sem verificar resistência/flambagem. A concordância com PyNite não dispensa referências analíticas; ambas foram usadas. Não houve relaxamento de tolerâncias nem substituição de hipóteses para obter aprovação.

**Conclusão: APROVADO COM RESSALVAS para manter/evoluir o protótipo axial isolado com a correção M1. A integração mista, interface e exposição HTTP continuam fora do escopo e não estão aprovadas por esta auditoria. Não foi executado merge.**
