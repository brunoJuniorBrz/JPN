# JPN — Plano executivo de implementação até 100%

**Data da revisão:** 10/11/2026
**Escopo do produto:** sistema web integrado para modelagem, análise, dimensionamento e documentação de coberturas e galpões metálicos com sistemas resistentes em aço e apoios em pilares metálicos, alvenaria existente, concreto existente e soluções híbridas. Inclui uma e duas águas, irregularidades, extensões, recortes e obras encostadas. Não promete cálculo universal de qualquer edifício de concreto ou alvenaria.

## 1. Definição rigorosa de 100%

Uma obra completa percorre: levantamento → topologia física e superfícies → tipos e restrições de apoio → materiais/seções reais → ações normativas → distribuição conservativa → combinações ELU/ELS → solver 3D com estabilidade pertinente → demandas contínuas → resistência/serviço dos membros → ligações e apoios → otimização → quantitativos, desenho, memorial e revisão profissional.

Atingir 100% requer: **todos os critérios de aceite de cada marco**, teste real no aplicativo pela mesma rota utilizada pelo cliente, casos independentes comparados, zero erro bloqueante na CI e nenhuma liberação falsa. O produto pode reprovar uma obra se faltarem dados, a tipologia exceder o domínio validado ou a segurança não for demonstrada.

Não usar *percentual de linhas programadas* ou número de PRs como medida. As pontuações abaixo são pesos do escopo fechado e **somente são conquistadas após aceite e integração na main**; não representam estimativa do progresso atual.

## 2. Situação de partida (sem assumir conclusão por PR aberto)

- PR #60 (integração visual/3D/M35) → PR #61 (fluxo guiado/Tom) permanecem drafts abertos, sem merge.
- PR #62 (transporte online de terças) parte do #61. É transporte específico, **não** substitui a integração remota do motor estrutural completo.
- PR #63 (modelos frame-only, axial-only e mistos) parte do #61; CI **9/9 sucesso** no commit `8dee13e`, pendente de revisão e integração.
- PR #64 (interfaces para parede/concreto/pilar, reações e editor) parte do #63. No commit `7ce6df9`, 8 jobs numéricos/estruturais passaram e o job web falhou em 2 Playwright de revisão curta; revisão do teste corrigida no commit seguinte, **sem afirmar CI do HEAD aprovada**.
- Motor Python já tem análise elástica 3D, cargas uniformes, peso próprio, treliça/pórticos, resultados de deslocamento, reação, esforço e verificações parciais. **Não** é ainda motor homologado para dimensionamento completo.
- Restrição técnica atual: distribuição de telhado/vento exige topologia gerada e retângulos, condições laterais/fechamentos não têm motor normativo global; segunda ordem mista e resistência/ligação/apoiamentos completos faltam; o `releaseGate` bloqueia fabricação corretamente.

## 3. Programa de implementação: 12 marcos, total 100 pontos

| Ordem | Marco | Pontos | Acumulado | Dependências |
|---|---|---:|---:|---|
| 0 | M36-F — consolidar código e baseline | 6 | 6 | #60, #61, #62, #63, #64 |
| 1 | M37 — geometria e tipologias físicas | 8 | 14 | M36-F |
| 2 | M38 — apoios, paredes e concreto reais | 8 | 22 | M37 |
| 3 | M39 — superfícies e cobertura irregular | 10 | 32 | M37–M38 |
| 4 | M40 — transmissão de ações para as barras | 10 | 42 | M39 |
| 5 | M41 — vento completo, fachadas e fechamentos | 12 | 54 | M39–M40 |
| 6 | M42 — biblioteca de ações e combinações normativas | 7 | 61 | M41 |
| 7 | M43 — análise global e estabilidade/segunda ordem | 11 | 72 | M38, M40, M42 |
| 8 | M44 — perfis, resistência ELU e serviço ELS | 14 | 86 | M43 |
| 9 | M45 — ligações, ancoragens, alvenaria e fundações | 8 | 94 | M43–M44 |
| 10 | M46 — perfis sugeridos, fabricação, orçamento | 3 | 97 | M44–M45 |
| 11 | M47 — jornada online e homologação de casos reais | 3 | **100** | M36–M46 |

**Os pontos são gates**, não percentuais automáticos por commit. M47 contém a homologação final; os testes de engenharia e segurança devem ocorrer em **todos** os marcos, não somente ao final.

### Marco 0 — M36-F (6 pontos): integração e congelamento de referência
1. Concluir verificação funcional de #60, #61, #63 e #64; fechar testes; resolver conflitos, preservar fixtures e golden hashes, sem alterar a física de modelo antigo.
2. Incorporar a capacidade remota de #62 **como serviço comum de execução para o motor inteiro**, ou manter o endpoint de terças como adaptador de uma API de análises versionada — não perpetuar dois motores Python diferentes.
3. Centralizar contratos e fonte única da obra, ids, revisões, `input_sha256`, geometria, materiais, casos, combinações, vínculos e proveniência.
4. Conferir backend Python, autenticação, isolamento do solver, limite de recursos, idempotência e auditoria, sem exigir localhost para o produto final.
5. Definir versionamento e migração para projetos antigos; não perder orçamento/levantamentos existentes.

**Aceite:** CI íntegra no commit final, contrato real Next→Python comprovado para modelo físico, mesma resposta numérica de referência em desenvolvimento e ambiente online, integração coordenada à main, nenhuma mudança que permita fabricação falsa.

### Marco 1 — M37 (8 pontos): geometria física geral
- Tipologias: uma água, duas águas, treliças, pórticos, contraventamentos, pilares novos, soluções mistas e cobertura presa a construção.
- Descrever nós e barras e suas ligações sem suprir pilares fictícios; ponto de início/fim, desníveis, mudanças de direção, recortes e balanços.
- Gerador paramétrico deve criar topologia apenas para arranjos explicitamente suportados; qualquer irregularidade não suportada leva ao editor físico, mantendo origem das medidas.
- Capturar carregamentos localizados, furos/aberturas, bordos, inclinação e geometria dos fechamentos.
- Preservar traço da origem do desenho e impedir desacoplamento da análise.

**Aceite:** modelos sintéticos de tipologias A-E reconstruídos geometricamente com mesmas barras/comprimentos/apoios; alteração da obra invalida os resultados.

### Marco 2 — M38 (8 pontos): condições reais de apoio
- Integração definitiva de `supportInterfaces` no formulário, importação, persistência, backup, exportação e relatórios.
- Diferença explícita entre nó, condição de contorno (6 DOFs), elemento que recebe a reação e capacidade efetivamente verificada.
- Paredes existentes: posição, material, espessura, altura, condição, evidência de inspeção, reforços, linha de apoio, transmissão concentrada/distribuída, ligação; concreto existente e bases de aço com tipos próprios.
- Apoio elástico/semi-rígido apenas com caracterização mecânica e validação; não presumir engaste de alvenaria ou concreto.
- Emitir reações N/V/M por caso e combinação; estados de capacidade pendente/excedida e invalidação quando o apoio mudar.

**Aceite:** nenhum DOF/reação atribuída a suporte não mapeado em obras mistas; comparação de esforços com oráculos e bloqueio para capacidade não avaliada.

### Marco 3 — M39 (10 pontos): superfícies físicas não retangulares
- Polígonos de telhado com múltiplas águas, L/U, recortes, furos, anexos, balanços e coberturas parciais; faces planas com vértices reais.
- Relacionar superfícies a terças e seus trechos, em vez de depender de retângulo envolvente ou de IDs do gerador.
- Segmentação explícita onde zona, peça, superfície, fixação ou apoio mudam; sem carga parcial escondida.
- Malha de transmissão e critérios para telhas, terças e apoios; reconhecer limites da idealização isostática.
- Conservar área projetada, área inclinada e quantidade de peças sem contagem dupla.

**Aceite:** cada topologia A-E com áreas exatas por referência geométrica independente; nenhuma sobreposição/lacuna silenciosa.

### Marco 4 — M40 (10 pontos): caminho de cargas unificado
- Converter cargas G/Q de superfície para telhas/terças/tesouras/vigas/pilares/apoios declarados; incluir peso das telhas, sobrecarga apropriada, acessórios, peso de peças e cargas lineares/pontuais.
- Distribuição conservativa em superfícies irregulares com faixas tributárias e comportamento de apoio declarado; permitir nós de parede e pilar em igual pipeline.
- Modelar transmissão de cargas de fechamento lateral aos elementos participantes sem lançar ações em barras desconectadas.
- Eliminar dupla contagem e separar casos por natureza; rastrear cada contribuição a caso, zona, superfície, peça e revisão.

**Aceite:** balanço de força e momento em cada camada e no resultado global; oráculos analíticos e comparação com solver externo; cargas em partes realmente vazias = 0.

### Marco 5 — M41 (12 pontos): vento e fechamentos
- Cadastrar localização, altura, entorno/topografia, direções, obstáculos, aberturas e estado de fechamento (aberto, parcialmente aberto, fechado etc.) conforme domínio normativo.
- Cálculo rastreável da velocidade e pressão dinâmica na norma aplicável; coeficientes externos/internos por direção, face/zona e hipótese de abertura. Nada presumido.
- Cobertura **e fachadas**: vento em paredes e fechamento transmitido ao sistema de contraventamento/apoios; sucção, pressão, zonas de borda/canto e reversões.
- Gerar alternativas mutuamente exclusivas coerentes; revisar fixações locais separadamente dos esforços globais.
- Resolver irregularidades no domínio suportado; casos normativos fora de escopo bloqueiam, com mensagem objetiva.

**Aceite:** casos independentes para vento longitudinal/transversal e pressão interna positiva/negativa, conservação dos resultantes e verificação de coeficientes por norma autorizada.

### Marco 6 — M42 (7 pontos): ações, combinações ELU e ELS
- Adquirir/acessar legalmente textos aplicáveis e manter registro de edição/versão corrigida/errata, cláusula, domínio, fórmula, fonte, ensaio de referência e autor da revisão.
- Biblioteca tipada de ações permanentes, variáveis, vento, manutenção e especiais aplicáveis; fatores, simultaneidade, exclusões, combinações ELU/ELS; sem duplicidade de peso próprio.
- Rastrear por cenário de obra e alteração; geração automática **somente** para regras efetivamente implementadas, com relatório de incertezas.
- Critérios de deslocamento/vibração e serviço dependentes da norma e uso da estrutura, não limites estéticos fixos.

**Aceite:** bater tabela de combinações com exemplos independentes da edição adotada; bloquear caso sem base normativa ou sem ação considerada.

### Marco 7 — M43 (11 pontos): estabilidade e segundo-ordem

**M43-P2:** [protótipo diagnóstico integrado](M43-P2-DIAGNOSTICO-PDELTA.md), com comparações OpenSees executadas e candidatos recusados. Recuperação de esforços e equilíbrio físico ainda impedem habilitação produtiva; o marco continua parcial, sem homologação ou liberação.

**M43-P3:** [alternativa corrotacional XZ e regressões obrigatórias](M43-P3-EQUILIBRIO-CONSISTENTE.md). Equilíbrio e referências equivalentes demonstrados em ensaios planos; refinamento dos portais e formulação/estabilidade 3D continuam pendentes. M43 permanece parcial e bloqueado para uso produtivo.

**M43-P4:** [convergência plana e núcleo espacial experimental](M43-P4-CONVERGENCIA-E-ESPACIAL.md). Quatro portais convergidos sem ampliar limites; núcleo SO(3) implementado com auditorias e referências, mas os quatro ensaios espaciais gerais continuam reprovados em componentes/energia. M43 permanece parcial, sem aprovação normativa ou fabricação.

**M43-P5:** [auditoria física espacial](M43-P5-VALIDACAO-FISICA-ESPACIAL.md). Comparação corrigida para orientações SO(3) físicas e referências refinadas; coluna biaxial aprovada em um benchmark estrito, corroborado por barra contínua independente. Pórtico, quadro espacial e braço excêntrico continuam reprovados/pendentes de refinamento; limites e fórmulas da P4 preservados. M43 permanece parcial e bloqueado para produção, aprovação normativa e fabricação.
- Generalizar solução linear já validada para frame-only, axial-only e mista, incluindo fôrmas de apoio/ligação realmente declaradas.
- Calcular modos de flambagem/estabilidade global; ações de segunda ordem P-Δ/P-δ, imperfeições e efeitos geométricos quando aplicáveis.
- Resolver limitação atual de Spring3D sem contribuição a Kg; ou selecionar formulação física equivalente validada com matriz geométrica, sem artifício de rigidez.
- Distinguir solução convergida de solução singular/mecanismo/alto condicionamento, e aplicar verificações de escalabilidade e domínio de deformações.
- Recuperar envelopes e extremos N/V/M/T/deslocamentos em todas as peças e combinações.

**Aceite:** casos próprios de pórtico deslocável, contraventamento, treliça e estrutura mista em primeira/segunda ordem; comparação independente Frame3DD/OpenSees ou referências reconhecidas conforme componente; instabilidade recusa aprovação.

### Marco 8 — M44 (14 pontos): resistência e serviço do aço
- Catálogo físico auditado: seção U/Ue, tubo retangular/circular, I/W, cantoneira e outras famílias explicitamente suportadas. Propriedades A/I/W/J/Iw, espessura, forma real, aço e fontes.
- Procedimentos completos por família: tração, compressão, flexão, cisalhamento, torção, flambagem local/distorcional/global/laterotorcional, interação e contenções relevantes.
- Perfis formados a frio com propriedades efetivas, cFSM/DSM quando normativamente aplicáveis, com validação separada do solver global.
- Verificação ELU e ELS peça × combinação × posição/trecho; demandas extremas contínuas e interpretação de ligações/contraventamento.
- Cada `check` guarda equação/cláusula, números de entrada, unidades, resultado, taxa de utilização, norma e revisão. Casos desconhecidos = `unsupported`, não `PASS`.

**Aceite:** pacote reproduzível de exemplos autorizados e cálculos independentes para toda família/modo anunciado; nenhum modo aplicável pendente em membro aprovado.

### Marco 9 — M45 (8 pontos): ligações, apoios existentes e fundações
- Parafusos, soldas, furos, chapas, ligações de tesouras/terças/contraventamentos, bases e chumbadores: força/cortante/momento/arrancamento, ruptura, interação e geometria, com regras aplicáveis.
- Capacidade de apoio em alvenaria/concreto: contato, apoio localizado, excentricidades, fissuras/estado da estrutura, ancoragem e caminho de cargas; considerar rigidez efetiva e reforços.
- Implementar módulos normativos específicos de verificações dentro de domínio fechado; quando o existente exigir perícia ou cálculo fora do domínio, exigir laudo/memorial verificado de profissional habilitado e deixar a aprovação automática bloqueada.
- Fundações: transmitir mapa de reações completo e verificar no domínio validado ou exigir projeto de fundação independente rastreável. Não supor suporte fixo apenas pela existência de uma parede.
- Conferência de ligações e suportes sempre por combinação, compatível com ações do solver.

**Aceite:** ensaios independentes de chapa/parafuso/solda/ancoragem e exemplos de parede/concreto/pilar; qualquer capacidade ausente/incompatível mantém bloqueio.

### Marco 10 — M46 (3 pontos): perfis, quantitativos e fabricação
- Sugestão/otimização de perfis só após verificações completas; seleção por massa/custo/disponibilidade, mantendo rastreio de alternativas que foram reprovadas.
- Peso/comprimento/compras realistas; perdas, estoque, comprimento comercial, plano de corte, montagem, referências de preços e data de cotação.
- Gerar DXF/PDF/memorial/lista de peças/cortes e orçamento a partir do mesmo hash e da revisão aprovada; não mostrar quantitativo preliminar como lista liberada para fabricação.

**Aceite:** orçamento consistente com o modelo e plano de corte, alterações invalidam produção; documentação reproduzível.

### Marco 11 — M47 (3 pontos): produto online e homologação final
- Frontend Next.js, motor Python autenticado e protegido, armazenamento durável de projetos/resultados, controle de usuário/revisões, isolamento e versionamento do serviço; tarefas longas assíncronas, idempotência, limites, logs e recuperação sem adulterar resultados.
- Jornada de obra real pela interface comum em celular/desktop, do cadastro até o relatório. Sem rota somente local, sem demonstração desconectada do motor; testes E2E reais.
- Biblioteca de referência A–F: cobertura em pilares, galpão em treliças, entre duas paredes, mista, parcial/irregular e caso do Tom com medições de campo e memorial independente. Pelo menos dois modelos completos equivalentes conferidos externamente, incluindo vento, estabilidade e ligações.
- Auditoria de segurança, regressão, stress/performance, dados legados, disponibilidade e documentação. Revisão final por engenheiro responsável com emissão de ART quando aplicável.

**Aceite final:** todos os 11 marcos anteriores integrados; CI 100% nos perfis requeridos; sem modo aplicável ausente para uma família suportada; benchmarking externo aprovado; nenhuma falsa liberação. Só então 100 pontos.

## 4. Critérios transversais a TODO PR

Cada entrega deve conter:
1. Contrato de domínio e regra de negócio, com fontes/edições auditáveis; nunca incorporar valores normativos sem verificação.
2. Teste unitário de caso válido e inválido, teste de invariância e conservação quando houver cálculo.
3. Teste real no Python 3.12 com versão pinada de dependências e teste TS de request/response reais, quando a entrega modificar o motor.
4. Comparação numérica independente, tolerâncias definidas ANTES do resultado e histórico de regressão.
5. Teste de integração da UI (desktop/celular), persistência e invalidação de revisões.
6. Documentação das limitações, risco e migração; estado de aprovação inalterado quando a família normativa ainda é incompleta.
7. CI `typecheck`, `lint`, unitários, Python, Playwright, build, DXF/exportações aplicáveis. Sem merge de CI vermelha.
8. Revisão humana especializada da matemática e responsabilidade técnica quando o PR reivindica domínio de dimensionamento.

## 5. Base normativa de pesquisa (confirmar em exemplar legalmente autorizado)

- ABNT NBR 8681:2025 — ações e segurança.
- ABNT NBR 6120:2019 (verificar erratas/versão corrente no Catálogo) — ações gravitacionais.
- ABNT NBR 6123:2023 (verificar versões corrigidas) — vento em edificações.
- ABNT NBR 8800:2024, Versão Corrigida:2025 — estruturas de aço e mistas.
- ABNT NBR 14762:2010 (verificar vigência/correções) — perfis formados a frio.
- ABNT NBR 16868-1:2020 (e correção aplicável) — projeto de alvenaria estrutural quando se justifica o apoio.
- ABNT NBR 6118:2026 **consta no catálogo oficial em novembro de 2026**, exigindo reconciliação das referências antigas a 2023 para suportes em concreto.
- ABNT NBR 6122:2019 com emenda/correção aplicável de 2022 — fundações.

Confirmar em cada caso se a norma é realmente pertinente ao material/apoio e qual versão válida se aplica à obra; dados públicos não substituem as equações completas dos documentos licenciados.

Fontes de pesquisa: https://www.abntcatalogo.com.br/ ; https://site.abece.com.br/em-vigor-a-nova-nbr-8681/ ; https://site.abece.com.br/em-vigor-a-nova-nbr-6123/ .

## 6. Ordem de execução imediata

1. Reparar a CI E2E do PR #64, refazer testes completos no HEAD e revisar as inconsistências entre #61/#63/#64 (e #62 como funcionalidade lateral). Só então consolidar no branch de integração, sem merge cego.
2. Abrir M37 para unificação da geometria real: topologia física declarada comum, formatos de telhado irregular, superfícies de fachadas e vínculos, com casos de teste completos.
3. Abrir M39/M40 em sequência para **transferência de ações em geometrias declaradas e apoios de alvenaria/concreto**, terminando com resultantes/nós/reação reais; não dedicar ciclo à interface cosmética ou outra calculadora isolada.
4. Em paralelo à geometria, auditar edições normativas e preparar bateria de oráculos independentes das etapas M41–M45; **sem copiar nem supor equações desconhecidas**.
5. Após os primeiros modelos passarem em toda a cadeia, expandir o escopo para vento, segunda ordem, resistência e ligações, sempre com aceites por família.
6. Só liberar mercado/fabricação depois da homologação externa e revisão profissional de cada domínio de engenharia.

## 7. Painel de acompanhamento

### Execução da sequência atual — atualização 10/11/2026

| Entrega | Branch / PR | Estado técnico | Integração na main |
| --- | --- | --- | --- |
| Consolidação M36-F | #66 | CI completa aprovada | Não mesclado |
| Geometria M37-P1 | #67 | CI completa aprovada | Não mesclado |
| Cobertura física M37-P2 | #68 | CI completa aprovada | Não mesclado |
| Caminho de cargas M39-P1 | #69 | Typecheck, lint, testes unitários e PyNite real passaram; CI do HEAD segue com Playwright/build | Não mesclado |
| Contornos ortogonais L e furos M39-P2 | #70 | Código, teste analítico e integração PyNite criados; CI do HEAD ainda pendente | Não mesclado |

**Gates ainda abertos:** consolidar os PRs sem conflicts; testar jornada da interface de lançamento das faces; conferir equilíbrio L/recortes no Python real e regressões; comprovar cobertura/fachadas/vento normativos; dimensionamento resistente, estabilidade e ligações. Nenhum ponto é contabilizado como concluído antes de integrar à main e aprovar seus critérios completos.


Para cada marco manter: `status` (not-started/in-progress/blocked/validated/merged), PRs, SHA integrado, condições de entrada, casos de teste, oráculos, regressões, pendências por norma, responsável técnico, riscos e data de aceite.

**Regra para contabilização:** pontos só são somados após *validated + merged + external criteria as applicable*. Trabalho em PR draft vale progresso de engenharia, não pontos de conclusão do produto.

**Status em 09/11/2026:** nenhum percentual consolidado deve ser anunciado sem auditar a main e os aceites. O JPN possui núcleos funcionais importantes, porém segue com `NOT_READY_BLOCKED` para liberação estrutural/fabricação.
