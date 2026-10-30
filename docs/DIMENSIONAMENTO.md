# Dimensionamento automático — próximo núcleo do produto

Atualizado em 30/10/2026. Este documento continua sendo o plano de dimensionamento normativo e integração. A auditoria acrescentou um [núcleo experimental de treliças planas](../engine/README.md), com análise linear e validação comparativa; a v0.6 o conecta ao painel de tesoura isolada, sem implementar dimensionamento. Arquitetura e limites atuais em [PREPROJETO.md](PREPROJETO.md). Resultados e limites em [AUDITORIA-MOTOR.md](AUDITORIA-MOTOR.md).

## Fluxo solicitado

O usuário é engenheiro. O objetivo é substituir a elaboração intermediária e entregar solução, cálculos e quantitativos para conferência ao final. A conferência não será uma autorização obrigatória para calcular, visualizar ou exportar resultados. Dados fisicamente necessários continuam necessários para um cálculo determinado; o sistema deve explicar o que falta, em vez de preencher valores fictícios.

## Separação de responsabilidades

O modelo geométrico entregue na v0.5.0 descreve peças entre eixos, sem cargas, rigidez, vínculos ou resistência. Não é diretamente um modelo de elementos finitos. Um adaptador futuro deverá discretizar banzos onde houver introdução de cargas, modelar excentricidades e ligações e verificar conectividade e estabilidade. Perfis cadastrados hoje têm apenas dados de levantamento; propriedades resistentes não podem ser deduzidas de um nome livre.

O próximo incremento precisa incluir:

1. Catálogo rastreável de seções, propriedades geométricas e materiais, com fonte e versão.
2. Condições da obra: localização, uso, geometria completa, fechamento, telhamento, condições de exposição e condições de apoio. Informações necessárias ao vento e às ações não se resumem a largura e comprimento.
3. Casos de carga e combinações identificados, com origem de cada parâmetro.
4. Modelo de análise, reações, esforços e deslocamentos por combinação, mais diagnóstico de instabilidade e convergência.
5. Verificações de resistência e serviço por família de seção e norma/edição efetivamente implementada.
6. Busca de alternativas de perfis e distribuições. Uma alternativa só pode ser classificada como atendendo aos critérios implementados se todos eles forem calculados. Critérios não implementados devem permanecer explícitos.
7. Objetivo de seleção configurável: custo cotado, massa ou fabricação. Preço ausente não pode ser estimado arbitrariamente para declarar a opção mais econômica.

## Pesquisa inicial do solver

PyNite é a candidata inicial para serviço Python separado. A documentação disponibiliza análise linear, análise geral iterativa, verificações de equilíbrio/estabilidade e análise P-Delta. O método linear não cobre os efeitos não lineares descritos pela biblioteca. O solver esparso depende de SciPy; a opção densa tem características diferentes de memória e desempenho. Fonte: [documentação de análise](https://pynite.readthedocs.io/en/latest/analysis.html).

A própria biblioteca delimita P-Delta/P-delta como parte da análise de segunda ordem, não substituto das exigências do código de projeto; esses efeitos não são considerados em placas. A documentação descreve casos de referência AISC. Eles são referências de teste do solver, não evidência de conformidade brasileira do JPN. Fonte: [segunda ordem e validação](https://pynite.readthedocs.io/en/stable/PDelta.html).

sectionproperties pode apoiar o cálculo de propriedades de seções, com análises geométrica, plástica e de empenamento. Não substitui o solver da estrutura nem as verificações normativas. Fonte: [guia de análise](https://sectionproperties.readthedocs.io/en/stable/user_guide/analysis.html).

Na entrega original, nenhuma biblioteca Python havia sido instalada. A auditoria posterior instalou e fixou NumPy 2.5.4, SciPy 1.18.1 e PyNiteFEA 3.2.1 para o pacote independente, examinou a API instalada e as licenças e executou comparações. PyNite permanece dependência de validação. A avaliação inicial de alternativas e as limitações normativas estão no relatório; catálogo oficial, aplicação das normas e prova de implantação do serviço Python continuam pendentes.

## Contrato proposto

`AnalysisRequest/v1`: identificador do projeto e revisão/hash dos dados; unidades explícitas; nós; membros e orientação dos eixos locais; seções e materiais com propriedades e fontes; vínculos e liberações; casos de carga; combinações; parâmetros de análise.

`AnalysisResult/v1`: mesmo hash de entrada; versão do solver; hipóteses; diagnóstico; equilíbrio; convergência; reações; esforços/deslocamentos por membro e combinação. Resultado de outra revisão não pode ser exibido como atual.

`DesignResult/v1`: norma/edição por verificação; equação e parâmetros; solicitação, resistência e utilização; limites de deslocamento; verificações não implementadas; alternativas consideradas e critério de ordenação. Uma falha de convergência é um resultado de erro, nunca um conjunto de esforços igual a zero.

O frontend pode permanecer Next.js, com cálculo local de geometria/quantidades. A viabilidade e os limites de execução Python precisam ser medidos antes de escolher a hospedagem. A integração não pressupõe que o runtime atual de frontend execute o solver.

## Evidência exigida para concluir

Comparar equilíbrio e deslocamentos com soluções conhecidas e exemplos publicados; testar estruturas instáveis, cargas reversas, unidades e combinações; verificar cada rotina normativa com exemplos independentes; comparar uma obra real calculada pelo cliente. Documentar o que cada caso demonstra e o que continua fora do escopo.

CAD permanece na última etapa, consumindo o modelo consolidado depois desses avanços.
