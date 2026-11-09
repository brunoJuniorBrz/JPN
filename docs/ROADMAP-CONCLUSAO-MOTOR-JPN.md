# JPN — Plano de conclusão do motor estrutural para obras reais

## Produto final e escopo
Um único fluxo, do cadastro da obra ao modelo físico rastreável e à emissão de peças verificadas, para coberturas e galpões de aço apoiados em pilares novos de aço, paredes existentes, concreto existente, fundações e combinações desses sistemas. Alvenaria/concreto existentes são **elementos de suporte** a avaliar, não vigas fictícias de aço nem estruturas completas de concreto modeladas automaticamente. Modelos fora desse escopo exigem procedimento físico e normativo específico.

Entrada: dimensões, contorno, inclinação, recortes, pé-direito, fechamentos laterais/aberturas, arranjo, nós e barras, perfis reais, aço, ligações, suportes, local da obra, ações, fontes e revisões. Nada pendente vira automaticamente rigidez, apoio, carga nula ou capacidade.

Saída: modelo 3D, cargas por peça/caso, combinações verificáveis, deformadas, reações, esforços, verificações de serviço e resistência, ligações e apoios, quantitativo e fabricação SOMENTE após bloqueadores resolvidos e revisão do profissional responsável.

## Etapas vinculadas a testes de aceite
| Ordem | Entrega técnica | Condição necessária para marcar concluída |
|---|---|---|
| 1 | Topologia 3D universal | Pórtico puro, treliça axial pura e misto; validação numérica independente + estabilidade sem barra fictícia. PR #63. |
| 2 | Apoios reais e caminho de esforços | Nó e DOFs vinculados ao tipo físico (pilar, parede, concreto, fundação), evidência, capacidades, reações e incompatibilidades. PR #64 parcial; ainda faltam cálculo e verificação normativa do suporte. |
| 3 | Cargas de cobertura em geometrias reais | Cobertura de uma e duas águas, irregular, em L, parcial e encostada; áreas e faixas tributárias rastreadas; balanço exato de forças e momentos, sem usar retângulo envolvente. |
| 4 | Vento do barracão completo | Declaração de fechamento lateral, aberturas, pressões internas/externas, zonas de telhado/fachadas, combinações e direção, com referência normativa e recálculo consistente. |
| 5 | Combinações normativas | Tipos de ação e finalidade ELU/ELS, fatores e simultaneidade/exclusividade, edições rastreadas, sem duplicidade de peso próprio. |
| 6 | Análise global | Segunda ordem e imperfeições conforme domínio aplicável; deslocamentos, estabilidade, flambagem, mecanismos, suportes laterais e comportamento das ligações validados ou bloqueados. |
| 7 | Resistência dos perfis | Famílias aprovadas explicitamente (U, Ue, tubo, I etc.): tração, compressão, flexão, cisalhamento, torção e interação; modos de flambagem e contenções; resistência por combinação/elemento. |
| 8 | Ligações, bases e estrutura existente | Parafusos, soldas, chapas, chumbadores, alvenaria/concreto/fundações, resistência e transferência de momento/cortante/tração; procedimentos explicitamente suportados. |
| 9 | Quantitativos para fabricação | Peças/medidas/perfis/material consolidados a partir da revisão aprovada; identificação de versão, plano de corte, custos e documentação; invalidação automática ao modificar dados físicos. |
| 10 | Homologação real | Campanha de obras com memoriais, desenhos e cálculos independentes, convergência, revisões de engenheiro habilitado e auditoria de casos-limite e regressões. |

## Matriz mínima de obras e testes
| Caso | Geometria/apoios | Referências independentes exigidas |
|---|---|---|
| A | Cobertura simples em pilares de aço | Viga biapoiada, pórtico em flexão, combinação gravidade/vento, reações e estabilidade global. |
| B | Galpão duas águas com treliças | Truss axial, vento longitudinal/transversal, terças, flecha, estabilidade fora do plano. |
| C | Cobertura apoiada em duas paredes existentes | Nós reais na alvenaria, ancoragem/compressão/arrancamento/cortante e caminho de carga, sem supor engaste. |
| D | Cobertura mista parede + pilar novo | Apoios assimétricos explícitos, distribuição de reação, ligação na estrutura existente, ligação/base do pilar. |
| E | Cobertura parcial/encostada ou irregular | Contorno real e recortes, zonas e distribuição de vento/gravidade sem área fictícia, peças com comprimento real. |
| F | Montagem do Tom | Dados reais coletados em campo, projeto físico auditável, orçamento existente conservado; comparação com solução assinada independentemente. |

## Política de aprovação
O estado inicial é NOT_READY_BLOCKED. A aprovação não depende de botão ou texto do usuário: requer entradas completas, domínio normativo implementado para TODOS os mecanismos aplicáveis, cálculo real, verificações de resistência e serviço, ligações, apoios, documentação e revisão técnica habilitada. Se faltar uma dessas etapas, `computedStructuralApproval=false` e `fabricationRelease=false` continuam. A análise elástica bem-sucedida NUNCA libera compra, corte ou fabricação.

## Registro de decisão
Não investir novamente em visualizações isoladas, prévias de deploy ou comparador de terças como prioridade principal. O próximo desenvolvimento, depois dos PRs #63/#64, deve ser a **transmissão de cargas de telhado e vento para geometria declarada real**, seguida de estabilidade e verificações resistentes/apoios. A interface acompanha as necessidades do motor, não define as hipóteses físicas.
