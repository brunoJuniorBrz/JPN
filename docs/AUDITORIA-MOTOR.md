# Auditoria do motor JPN — 30/10/2026

## Resultado e autenticidade do histórico

Foi implementado e executado um núcleo Python experimental para treliças planas. **1.183 testes Python + 48 Vitest + 14 Playwright aprovados**, sem testes ignorados; TypeScript, ESLint, integridade de dependências Python e build Next.js aprovados. O código não está liberado para projetos reais nem conectado à interface. Não há dimensionamento normativo ou declaração de segurança estrutural.

A cópia recebida é um diretório extraído, sem `.git`, `node_modules`, ambiente Python ou executáveis Node/Python utilizáveis no PATH. O comando `python` apontava para o atalho da Microsoft Store; `git` não estava instalado. A busca nos arquivos do repositório não encontrou `.py`, solver de treliça, dependência PyNite ou evidências dos alegados 20 testes/1.000 treliças anteriores. O documento `DIMENSIONAMENTO.md` confirmava que a integração Python era apenas planejada. **Não foi possível autenticar nem reproduzir aquele protótipo ausente**; não se atribuem os novos resultados ao trabalho histórico.

Antes das mudanças funcionais, `pnpm install --frozen-lockfile` instalou as versões já fixadas: 47 testes Vitest e 14 Playwright passaram; TypeScript e lint passaram. As versões do aplicativo/lockfile foram preservadas. Node 24.13.0 e Python 3.12.10 foram preparados localmente em `.tools/`, sem alterar o PATH global. O histórico de instalação e artefatos temporários fica fora dos fontes. A instalação regular reproduzível com venv está em [engine/README.md](../engine/README.md).

## Arquitetura inspecionada

| Área | Implementação e limite |
| --- | --- |
| Aplicativo | Next 16.4.3 App Router, React 19.3.1, TypeScript strict, Zod, Context API e Tailwind; aplicação local sem backend de cálculo |
| Geometria | `src/domain/calculations/geometry.ts`: cobertura de uma água, medidas m e entidades mm; não contém rigidez/cargas |
| Peças | `structure.ts`: nós 3D, pilares/banzos/diagonais/montantes/terças e massa onde há kg/m; não é modelo FE |
| Quantitativos/orçamento | Comprimentos geométricos e massas separados de compras comerciais; orçamento em centavos/BigInt, preços explícitos |
| Persistência | Snapshot v3 em localStorage, migração v1/v2, importações como cópias e detecção de conflitos; sem transações entre abas |
| Documentos | PDF e XLSX comerciais/de levantamento; testes reabrem os documentos e verificam separação de dados |
| Testes existentes | Vitest nos domínios, persistência e exportações; Playwright em jornadas e larguras de 320 a 1440 px |
| Novo núcleo | `engine/jpn_structural/`: contrato SI estrito, montagem de barras axiais, álgebra SciPy/LAPACK e CLI JSON; sem chamadas nas telas |

Os guias locais da versão instalada de Next para Vitest/TypeScript foram lidos antes de alterar código. A documentação técnica/roadmap, rotas, componentes de cadastro/planejamento/orçamento, domínios, persistência, exportações e suítes existentes orientaram a separação do novo pacote. Não foi reescrito módulo funcional do aplicativo.

Permanecem incompletos: catálogo com propriedades resistentes rastreáveis, cargas/combinações normativas, vento, resistência/serviço, ligações, estabilidade espacial, corte, CAD, serviço Python e persistência/versionamento de análises. As terças geométricas podem tocar banzos entre nós; uma conversão direta das peças em barras não representa corretamente essa transmissão de cargas. Pilares de um pórtico não podem ser presumidos como barras articuladas de treliça.

## Defeitos e divergências

| Gravidade | Constatação | Tratamento e evidência |
| --- | --- | --- |
| Alta, rastreabilidade | Provas do protótipo histórico ausentes | Registrada a ausência; criado pacote e campanha novos, com versões, sementes e hashes. O histórico não foi declarado autenticado |
| Baixa, geometria | `ceil(L/max - 1e-10)` podia produzir vão acima do máximo | Regressão falhou com 20,0000000001 m e limite 5 m: vão 5,000000000025 m. Removido epsilon fixo e conferido o espaçamento calculado; cobre tesouras e terças |
| Média, robustez | Nova CLI não tratava o `ValueError` do parser para inteiro JSON com 5.000 dígitos | Regressão confirmou traceback/exit 1; agora retorna erro JSON/exit 2 sem resultados fictícios |
| Ajuste de teste, sem defeito de cálculo | Triângulo com altura `1e-5 m` retornou `MODEL_LIMIT`, enquanto o teste inicialmente esperava `ILL_CONDITIONED` | O condicionamento ainda estava abaixo do limite; deslocamento excedia o domínio linear. Mantidos limites; acrescentados casos distintos: `1e-5` → movimento excessivo e `1e-6` → mal condicionado |
| Ambiente | Python embutido não importa backend setuptools na instalação isolada e omite diretório do script | Instalação local com backend fixado/`--no-build-isolation`; runner resolve seu diretório explicitamente. Ambiente virtual regular recomendado |

Não houve divergência numérica fora das tolerâncias na campanha PyNite nem falha crítica remanescente nos casos executados. Isso não cobre todo o espaço de entradas. Mecanismos, matrizes singulares, coincidências, tipos/unidades incorretos e aritmética não finita são erros explícitos, não sucessos com esforços zerados. A inexistência de flambagem, análise espacial e dimensionamento é uma limitação crítica para uso real, não uma verificação aprovada.

## Evidência executada

| Verificação final local | Resultado |
| --- | --- |
| Python: analíticos | 16 aprovados |
| Python: comparação PyNite | 1.000 casos aleatórios + 8 referências por barras liberadas + 4 recalques + 3 rejeições de mecanismos = 1.015 aprovados |
| Python: entradas inválidas/erros/CLI | 97 aprovados |
| Python: invariância, superposição, energia e reciprocidade | 55 aprovados |
| Total Python | **1.183 aprovados, 0 falhas, 0 erros, 0 ignorados** |
| Vitest final | **48 aprovados, 0 falhas**; baseline 47 |
| Playwright/Chromium final | **14 aprovados, 0 falhas, 0 ignorados, 0 flaky** |
| TypeScript / ESLint / build | Aprovados, código de saída 0 |
| `pip check` | Sem dependências quebradas |

As falhas de regressão anteriores à correção foram reais e estão descritas acima; a tabela registra a execução final. Testes de rejeição que passam significam que a entrada foi recusada como esperado, não que um mecanismo foi resolvido.

Arquivos arquivados em [validation/2026-10-30/](validation/2026-10-30/): `structural.json` (resultados, ambiente, hashes e sementes), `pytest.xml` (casos individuais), `vitest.json`, `playwright.json` e `application.json` (resumo e códigos de saída). Para regenerar Python, executar `python engine/validate.py`; para o aplicativo, os comandos de testes/build do README. A campanha adicional do runner mede desvios sobre as mesmas 1.000 sementes, não constitui outros 1.000 testes únicos.

Ambiente local: Windows x64, Python 3.12.10, NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1, pytest 9.2.0; Node 24.13.0, pnpm 12.15.0 e pacotes do `pnpm-lock.yaml`. A workflow adicionada prevê Windows/Linux, mas nenhuma execução remota foi observada; validação Linux/macOS e com outro BLAS continua pendente.

## Comparação com PyNite

Sementes **0–999**, quatro famílias de geometria, seções e E variáveis, apoios por eixos diferentes, balanços e redundâncias. Compara todos os deslocamentos XY, reações XY e axiais por barra. Também reconstrói equilíbrio de cada nó, forças/momento globais, compatibilidade e trabalho/energia fora dos diagnósticos do solver.

| Grandeza | Maior diferença absoluta | Semente |
| --- | --- | --- |
| Deslocamento | **2,0459328675670463 × 10⁻¹⁴ m** | 471 |
| Reação | **1,6542617231607437 × 10⁻⁷ N** | 471 |
| Esforço axial | **1,680455170571804 × 10⁻⁷ N** | 471 |

Tolerância comparativa definida antes dos testes: relativa `1e-7`, absoluta `1e-11 m` ou `1e-5 N`. Não foi ampliada. A API instalada foi examinada (`FEModel3D.py`, `Spring3D.py`, `Member3D.py`); barras foram representadas por molas axiais bilaterais `EA/L` e, em oito verificações, por membros com momentos liberados em ambos os extremos. PyNite tem axial local com sinal oposto ao positivo de tração do JPN. Nenhuma rigidez artificial foi acrescentada ao plano XY. Detalhes, justificativas e limitações das tolerâncias no [README do motor](../engine/README.md).

Referência analítica do triângulo em `engine/examples/triangle.json`: dois apoios separados por 2 m, ápice (1,1) m, E=200 GPa, A=0,001 m² e carga vertical −10 kN. Reações verticais de 5 kN em cada apoio; banzo de +5 kN; diagonais de −7,071067811865 kN. Deslocamento vertical do ápice `−P(√2+1/2)/(EA) = −9,571067811865×10⁻⁵ m`. Esse resultado é obtido por estática/trabalho virtual, independentemente do PyNite. O refinamento axial 1–32 elementos preserva a solução exata `PL/EA`.

## Dependências avaliadas e decisão

| Ferramenta | Evidência/compatibilidade | Decisão |
| --- | --- | --- |
| NumPy 2.5.4 | Metadados instalados: Python ≥3.12; expressão de licença `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`; projeto público mantido | Runtime, arrays/álgebra; sem reimplementar fatorações |
| SciPy 1.18.1 | Python ≥3.12, licença BSD e avisos de componentes incluídos; documentação de solve/eigensolução, LAPACK | Runtime, solução SPD e diagnóstico espectral |
| PyNiteFEA 3.2.1 | Python ≥3.11, MIT; release em 29/10/2026; API/assinaturas/código instalados conferidos. Documentação web identifica 3.2.0 e pode divergir do patch | Referencial de validação fixado; não dependência runtime do JPN |
| sectionproperties | MIT, análise por FE de propriedades de seções, documentação de teoria/API e manutenção pública | Candidata futura para seções, não resolve esta comparação; não instalada |
| anaStruct | Análise 2D de pórticos/treliças e documentação pública; escopo pode servir de terceiro referencial | Avaliada inicialmente; não instalada ou incorporada. Licença/transitivos da versão selecionada exigem revisão antes de adoção |

Fontes primárias consultadas: [release PyNite 3.2.1](https://pypi.org/project/PyNiteFEA/3.2.1/), [repositório/licença PyNite](https://github.com/JWock82/Pynite), [análise PyNite](https://pynite.readthedocs.io/en/latest/analysis.html), [membros/liberações](https://pynite.readthedocs.io/en/latest/member.html), [NumPy](https://numpy.org/), [solve SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.solve.html), [licenciamento SciPy](https://scipy.org/faq/), [sectionproperties](https://pypi.org/project/sectionproperties/), [anaStruct](https://pypi.org/project/anastruct/). Metadados e `pip check` conferiram a compatibilidade das versões instaladas; dependências completas de validação estão fixadas em `requirements-validation.lock`.

A montagem elementar é pequena e explícita para permitir auditoria; a álgebra numérica complexa foi delegada a bibliotecas consolidadas. Uma expansão para pórticos/segunda ordem deve avaliar adoção direta de solver validado em vez de ampliar este protótipo sem referências adicionais. A concordância com PyNite não elimina erros compartilhados em NumPy/SciPy/BLAS; por isso existem soluções analíticas e verificações físicas.

## Normas e limites de engenharia

O [catálogo oficial ABNT](https://abntcatalogo.com.br/) consultado apresentou **NBR 8800:2024 Versão Corrigida:2025**. A consulta ao link público individual da NBR 6123 retornou **“LINK EXPIRED”**, portanto não foi possível confirmar diretamente o registro vigente/correções nem acessar o texto completo. A edição/correções da NBR 6123 devem ser conferidas no Catálogo/Coleção oficial antes de implementar vento; nenhuma fórmula ou parâmetro de vento foi incorporado nesta tarefa. As fontes disponíveis não autorizam supor os requisitos completos das normas.

Não foi implementado dimensionamento ABNT. Seguem pendentes a consulta licenciada aos textos aplicáveis, catálogo/proveniência de perfis, ações e combinações, resistência das seções e barras, flambagem global/local, deslocamentos de serviço, ligações, fundações e responsabilidade técnica. O limite operacional de movimento/deformação de 1% e as tolerâncias numéricas não são critérios da NBR 8800/6123. A solução pode falhar por flambagem ou segunda ordem mesmo abaixo de 1%.

O solver suporta somente barras axiais articuladas em plano XY, material elástico linear, E/A constantes por barra, cargas nodais e vínculos cartesianos com deslocamentos prescritos. Não calcula flexão, torção, instabilidade espacial, dinâmica, plastificação ou segunda ordem. Nenhum peso próprio/carga distribuída/combinação é inventado. Não há classificação de perfis como seguros nem otimização comercial. Uso real requer validação técnica independente, domínio ampliado e responsabilidade de engenheiro habilitado.

## Arquivos criados e modificados

Criados:

- `engine/pyproject.toml`, `requirements-validation.lock`, `README.md`, `validate.py` e `examples/triangle.json`.
- `engine/jpn_structural/__init__.py`, `model.py`, `solver.py`, `__main__.py`.
- `engine/tests/__init__.py`, `cases.py`, `checks.py`, `oracle.py`, `test_analytical.py`, `test_invalid.py`, `test_invariants.py`, `test_pynite.py`.
- `.github/workflows/validation.yml`, este relatório e os cinco arquivos de evidência em `docs/validation/2026-10-30/`.

Modificados:

- `src/domain/calculations/structure.ts` e `structure.test.ts`: correção e regressão de espaçamento máximo.
- `.gitignore` e `eslint.config.mjs`: ignoram runtimes locais/venv e artefatos Python temporários.
- `README.md` e `docs/DIMENSIONAMENTO.md`: estado atual, reprodução e separação entre análise experimental e dimensionamento.

Sem Git nesta cópia, a comparação dos arquivos alterados foi feita com cópias locais do estado inicial, preservadas em `.tools/original/`. Não houve commit, publicação, migração de dados do usuário ou alteração das dependências JS.

## Próximas três prioridades

1. **Revisão técnica independente e ampliar referências:** conferir domínio, condicionamento e sinais com engenheiro habilitado; executar a CI em outra plataforma/BLAS e acrescentar benchmarks publicados e uma treliça real calculada independentemente. Recuperar o protótipo histórico se existir em outra cópia.
2. **Adaptador de análise rastreável:** catálogo E/A com fonte, plano e discretização explícitos, cargas/vínculos/ligações, mm→m, projeto/revisão/hash, serviço Python e tratamento de erro sem publicar resultado desatualizado. Verificar adequação de pórticos/estabilidade espacial antes de levar o gerador 3D ao solver.
3. **Dimensionamento separado:** confirmar edições e textos normativos licenciados, implementar ações/combinações e verificações de resistência/serviço por família de seção, com benchmarks por equação. Quantitativos/orçamento continuam módulos separados; otimização e CAD vêm depois.
