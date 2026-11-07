# JPN — primeira etapa do motor de terças (M35-P1)

## O que foi entregue

Esta entrega é uma **ferramenta real de análise elástica**, acessível em `/tercas`. Não usa exemplos de resultado pré-calculados: cada clique envia a geometria e os dados declarados para um worker Python 3.12 isolado e com limitação de memória, tempo e saída.

- Linha com 1 a 5 vãos **iguais**, apoiada em todos os nós; extremidades articuladas (rotação livre) ou engastadas; opção de balanço engastado com exatamente 1 vão.
- Carga **uniforme vertical e explicitamente informada em N/m**, negativa para baixo e positiva para cima; peso próprio e vento **não são gerados**.
- Perfis de seção U simples, U enrijecido e tubo retangular; valores nominais editáveis de altura, largura, espessura e aba (quando cabível), sem raios de dobra ou correções industriais.
- Elástico linear de Euler–Bernoulli (plano de flexão definido), solução por matriz de rigidez com 2 GDL/nó; vetor de cargas consistentes; reações, momentos, cortantes, deslocamentos máximos por busca dos extremos do polinômio de deflexão exato sob UDL.
- Até 8 perfis comparados no mesmo carregamento; aproximação de área, inércia no eixo de flexão, massa (densidade declarada) e custo apenas se o preço por metro for informado; comparação com limite de flecha L/n **especificado pelo usuário**, não prescrito pelo JPN.
- Resultados são associados a um `request_id` e verificados no servidor (contrato, IDs, equilíbrio) antes de aparecer; edição de dados oculta resultados antigos; exportação JSON inclui entrada e resultado; rascunho local persiste por navegador.
- Rota **somente local** (Node `pnpm dev:structural`), protegida por validação do Host, origem/referer same-origin, cabeçalho próprio, limites de tamanho, processos, tempo e memória.

## Como testar (Windows)

Use a branch `feat/m35-purlin-calculator` a partir da raiz do JPN. Requer Node.js 24, pnpm e Python 3.12 com as dependências já fixadas do projeto.

```powershell
git fetch origin
git switch feat/m35-purlin-calculator
pnpm install --frozen-lockfile
pnpm dev:structural
```

Abra `http://127.0.0.1:3000/tercas`, ou **Projetos → Calcular terças**.

Se a análise retornar “Python 3.12 não disponível”, instale/configure o ambiente Python do JPN em `.venv` e as dependências de `engine/requirements-validation.lock`; o worker consulta `.venv/Scripts/python.exe` no Windows. Não use `pnpm dev` para executar o cálculo, pois essa rota exige `dev:structural`.

**Teste reproduzível:** 1 vão, L = 4 m, carga = −1000 N/m, E = 200 GPa, `U 75×40×2,65` (seção geométrica aproximada). A reação em cada apoio deve ser **+2000 N** e o momento máximo absoluto **2000 N·m**. A flecha depende da inércia calculada e não deve ser interpretada como dimensionamento seguro. Troque a carga para −1600 N/m: as reações e o momento devem multiplicar por 1,6.

## Evidências de validação

No HEAD da entrega, em sandbox Linux com Python 3.12 e PyNiteFEA 3.2.1 (dependências reais):

- `pnpm typecheck` e `pnpm lint`: passaram.
- `pnpm build`: passou.
- `pytest engine/tests/test_local_mixed_worker.py engine/tests/test_purlin.py`: **22/22 aprovados**, incluindo regressões do worker preexistente. Os 15 testes novos cobrem referência analítica biapoiada, extremidades engastadas, balanço, dois vãos contínuos, reversão de sinais, geometria e falhas de validação.
- `vitest run src/domain/quick-project-guided.test.ts src/domain/loaded-mixed.test.ts`: **11/11 aprovados**.
- `playwright test tests/e2e/purlin-calculator.spec.ts`: **3/3 aprovados**; executa Python real (sem mock), confirma ida e volta da API, exportação, recálculo, bloqueio de espessura impossível e viewport 375/1440 px.

## Segurança e escopo — não extrapolar

**É cálculo de deformações e esforços em modelo idealizado; não é aprovação resistente nem dimensionamento normativo.** Perfis U e U enrijecido são particularmente sensíveis a torção e flambagem local/distorsional; a flexão plana aqui não contempla esses estados limites. Efeitos de travamento pelo telhamento, excentricidades de ligação, distribuição real de vento, peso próprio automático, combinações NBR, ligações, capacidade dos apoios, chapas, parafusos e estabilidade global permanecem pendentes.

O campo **“Dentro do limite de flecha informado”** avalia somente o deslocamento elástico para o L/n preenchido, não aprova a peça. `computedStructuralApproval=false` e `fabricationRelease=false` são imutáveis no contrato. Sem uso para comprar, cortar ou fabricar. O acompanhamento e a responsabilidade por projeto e revisão técnica continuam exigidos.

## Relação com open source

- [PurlinLine.jl](https://github.com/runtosolve/PurlinLine.jl) — referência de escopo: perfis C/Z sob gravidade/sucção, com flambagem/torção/ligações que **não foram implementadas neste estágio**.
- [TrussMe](https://github.com/cmccomb/TrussMe) — referência da estratégia de comparar alternativas, sem reutilização do solver de treliças axiais.
- [Steltic CFS](https://github.com/Steltic/steltic_cfs) — referência de organização de métodos de aço formado a frio com análise FEM e relatórios.

Nenhum código dessas bibliotecas foi copiado ou incorporado nesta implementação. O núcleo atual é independente, com problema reduzido para possibilitar validação analítica; evitar confundir sua aprovação de testes com validação de dimensionamento NBR.

## Próxima etapa técnica

1. Integrar a lista de perfis com catálogos publicados rastreáveis e seção de geometria com raios verificados.
2. Integrar as solicitações reais das terças ligadas ao modelo da cobertura do projeto (apoios e caminho de carga).
3. Aplicar ações de vento e telhamento corretas, com combinação e origem normativa.
4. Conectar módulos de resistência NBR 14762/8800 e verificações de torção/flambagem e ligações conforme o domínio aplicável.
5. **Somente depois** habilitar classificação/otimização como seção admissível para o uso declarado, com validação externa de engenheiro.

Este PR está empilhado sobre a interface #56, que está sobre a M35 #53. Não realizar merge automático com #54/#55 sem resolver as divergências e revalidar.
