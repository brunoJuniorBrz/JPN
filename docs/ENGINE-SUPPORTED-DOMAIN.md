# Domínio efetivamente implementado — campanha M27–M30

Atualização posterior: a [Missão 32](MISSAO-32-ESTABILIZACAO-E-SEGUNDA-ORDEM-MISTA.md)
corrige o resíduo reduzido e os espaços cFSM com comparação executável externa.
Resultados automáticos `/2` e `/3` exigem recálculo pelo `/4`. O novo protótipo
misto é exclusivo da CLI, usa tensão inicial em duas etapas e mantém sua
liberação bloqueada. O quadro abaixo conserva o domínio histórico M27–M30.

Adendo posterior: a [Missão 31](MISSAO-31-AUDITORIA-EVOLUCAO-ESTRUTURAL.md)
introduz avaliação cFSM com conferência de energia/resíduo e uma experiência
offline de P-Delta de barra-coluna reta, prismática e discretizada explicitamente.
Ela não habilita segunda ordem do modelo misto nem pórticos gerais. O quadro
abaixo registra o domínio da entrega anterior; os bloqueios globais continuam.

Estado: **NÃO PRONTO — BLOQUEADO para dimensionamento estrutural completo**.
Esta entrega acrescenta cálculo funcional ao domínio experimental. Não anuncia
uma família de perfis homologada ou cobertura autorizada para construção.

| Procedimento | Ue formado a frio | I/W laminado/soldado | Axial | Limite |
|---|---|---|---|---|
| Análise linear mista anterior | Preservada | Preservada | Preservada | E, G, A, I, J, vínculos e ações físicos declarados |
| Propriedades brutas Python | Geometria C com lábios e raios explícitos | I simétrico com raio explícito | Não há inferência de seção | sectionproperties 3.10.2, não propriedades efetivas |
| Esforços contínuos | Pórticos v2 | Pórticos v2 | N constante | N/Vy/Vz/T/My/Mz; sem extremos de interação resistente |
| Flecha da peça inteira | Pórticos v2 retos | Pórticos v2 retos | Não suportada | Corda dos extremos originais em XYZ; todos os segmentos |
| Critério de flecha declarado | Calcula atende/excede | Calcula atende/excede | Bloqueado | Combinações explicitamente declaradas SLS; não é homologação ELS |
| Faixa finita elástica | Grafo de paredes e tensões explícitas | Só grafo compatível, sem anúncio de validação por família | Não aplicável | pyCUFSM separado, S-S, m=1, grade explícita; sem classificação modal |
| Resistência ABNT completa | Não implementada | Não implementada | Não implementada | Todos os modos aplicáveis continuam bloqueadores |
| Segunda ordem no modelo misto | Não habilitada | Não habilitada | Spring3D sem Kg | P-Delta nativo apenas auditado em testes de pórtico |

As tipologias de uma/duas águas e 207 peças continuam utilizáveis no solver
linear quando há declaração física completa. O desenho visual não fornece
apoios, ligações, propriedades ou cargas por si só. A implementação não cria
limite de vão de projeto; limites de recursos não são limites de segurança.

**Seções:** dimensões em mm, Poisson explícito e fonte/revisão/responsável.
Área, centroide, Iy, Iz, Iyz, módulos elásticos, J, Iw e centro de cisalhamento
provêm da biblioteca real. E e resistência unitários são normalizações internas
matemáticas, não propriedades atribuídas ao aço; índices internos de escoamento
não são exportados. Biblioteca x,y corresponde a JPN y,z. Não há cópia automática
das propriedades para o solver, cuja declaração física permanece explícita.
Três malhas registram refinamento; `observed` não certifica erro nem resistência.
Arcos têm 64 pontos. A área poligonal difere da geometria circular ideal.
Limites: 2.000 mm por dimensão, área/malha ≤ 8.000 antes da geração e 40.000 nós
de malha depois. Se excedidos, recusa sem aprovação.

**Faixas finitas:** perfil Python isolado NumPy 2.2.6/SciPy 1.15.3/pyCUFSM 0.2.0.
No máximo 60 nós, 60 paredes e 120 semicomprimentos explicitamente declarados.
Tensões em MPa, coordenadas/espessuras em mm, quatro vínculos por nó de seção.
Não procura mínimo contínuo no comprimento, não classifica modos locais ou
distorcionais e não aplica fatores de resistência ou procedimentos DSM/ABNT.
O controle serve à investigação elástica local via CLI, ainda sem editor na UI.

**Ligações:** a auditoria geométrica suporta uma chapa retangular referenciada,
furos circulares com coordenadas, passos e bordos do centro do furo à borda mais
próxima. Calcula A bruta transversal e apenas um corte reto pelos centros dos
furos. Cortes excêntricos, caminhos escalonados e múltiplas chapas são pendentes;
não são substituídos por um caminho presumido. Não verifica distância normativa
mínima, parafusos, soldas, ruptura governante, ancoragens, concreto ou fundação.

**Operação:** propriedades novas são locais, com subprocesso `-I`, limite de
768 MiB, timeout 20 s, entrada 500 kB/saída 2 MB e exclusão compartilhada com o
solver. A API nova recusa produção/origem remota. Não há integração HTTP remota
dessas bibliotecas nem deploy nesta entrega. Os contratos anteriores 2D, frame3d
e mixed3d/1 e /2 permanecem inalterados. Relatórios derivados evoluem para
continuous-demands/2 e resistance-report/2; backups antigos continuam legíveis.

Edições, revisões físicas, critérios, resultados e hashes permanecem separados.
Um sucesso numérico, geométrico ou de limite declarado nunca remove bloqueios
normativos, revisão profissional, responsabilidade legal ou fabricação.
