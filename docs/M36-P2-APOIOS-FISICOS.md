# M36-P2 — apoios físicos de alvenaria, concreto e aço

## Problema real
O cadastro do JPN possui categorias ilustradas para alvenaria/concreto/estruturas mistas, mas as categorias não são condições de contorno do solver. Esta mudança introduz interfaces físicas por nó, que devem coincidir com os DOFs explicitamente declarados pelo projetista e com a escolha de cada lado da obra. Nenhuma categoria cria apoio, peça, módulo, seção ou rigidez automaticamente.

## Fluxo da engenharia
1. A geometria declarada define nós e peças em coordenadas reais. O projetista escolhe os nós que realmente transferem esforço para a estrutura existente ou para um pilar novo.
2. Cada `supportInterface` identifica nó, lado da obra, tipo de apoio (pilar novo, alvenaria existente, concreto existente, fundação ou outro), hipóteses de graus de liberdade, fonte/revisão, caminho de carga e justificativa dos vínculos.
3. O preflight do adaptador compara cada interface ao apoio físico presente na preparação; divergir por mudança de geometria/DOFs invalida o processamento. Estruturas mistas exigem ao menos uma interface coerente por lado; tipo desconhecido bloqueia. Estruturas existentes ainda exigem inspeção/revisão declarada. A opção guiada não fornece restrições automaticamente.
4. O solver continua Python real. Depois da análise, o relatório derivado registra reações por nó e combinação, com verificação numérica contra capacidades de compressão, arrancamento e cortante declaradas, quando disponíveis. Valores ausentes ficam pendentes, valores excedidos são identificados, sem dizer que a capacidade foi calculada pelo JPN.
5. A capacidade real de alvenaria, concreto, ligações, ancoragens e fundações **não está implementada**, assim como interação de esforços, combinações normativas completas e dimensionamento resistente global. Um valor cadastrado pelo projetista não certifica uma parede.

## Limites e validação
- A inspeção é uma declaração de origem, não uma verificação automática de resistência.
- A comparação de capacidade é preliminar, não uma checagem de estados-limites pela ABNT. Não considerar ações locais, ruptura da base, rigidez semilinear, ancoragem de armadura ou redistribuição por fissuração.
- Nenhuma atualização na main, nenhum cálculo aprovado para fabricar. Rodar typecheck/lint/Vitest, integrações Python e Playwright antes de considerar pronto.
