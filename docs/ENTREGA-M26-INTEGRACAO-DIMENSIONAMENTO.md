# M26 — integração e precondições verificáveis do dimensionamento

## Resultado e limites

**M26 parcial: integração M22–M25, solicitações críticas contínuas e cadastro físico Ue. Nenhum procedimento resistente normativo completo implementado.** Peças, ligações e fabricação continuam não aprovadas. O resultado de primeira ordem não comprova estabilidade normativa. Não houve merge em main ou deploy.

O incremento resolve o bloqueio matemático das cinco estações para os componentes individuais dos esforços e translações locais no domínio atual de cargas uniformes integrais. Não resolve o extremo de uma função de interação, flambagem, segunda ordem, empenamento, critérios de serviço ou aprovação normativa de ações/combinações. O cadastro de propriedades não substitui o cálculo ou a certificação delas.

## Bases realmente integradas

HEADs confirmados antes de começar, todos ainda sem merge:

| Entrega | Branch / PR | SHA |
| --- | --- | --- |
| M22 | feat/engineering-m22-m24 / #30 | 280a4c89b6e41a2a5295142dcd2b5bfc6d7208e0 |
| M23 | feat/m23-resistant-design / #31 | e97fb74c5eef2e0c70bf3ba88fc0c91de64566fe |
| M24 | feat/m24-connections-stability / #33 | f2c94b7e1ffb1d0e48214ade907b897d0dec8b7c |
| Preparação M26 | docs/m26-normative-readiness / #34 | 6c3022749288f29f70648d6dd699fc5b8191d59f |
| M25 independente | feat/m25-preproduction-dossier / #29 | 085c22876226a2b9de4f18e589368236c2619715 |
| Campanha de obras | docs/real-roof-validation-campaign / #32 | 34eb8cf13093ca943dbb886f5b3646f997ef5a0e |

CI da base #34: [41486638811](https://github.com/brunoJuniorBrz/JPN/actions/runs/41486638811), concluída com sucesso. Lidas a prontidão, o manifesto de referências, as entregas M22–M24, o dossiê M25, a campanha de obras e as auditorias dos PRs #30/#31/#33. A CI da base não é evidência de execução do novo commit.

O diretório recebido não tem `.git` nem Git disponível. Criado snapshot isolado `.tools/mission26-worktree`, conferido contra os 430 blobs da base remota. A publicação usa a conexão GitHub, com verificação dos hashes da árvore. Branch de entrega: `feat/m26-integrated-normative-engine`; PR draft contra `docs/m26-normative-readiness`. Os pais adicionais da integração preservam os históricos da M25 e do PR #32, sem alterar suas branches.

### Conflitos resolvidos

- `vercel.json` e `engine/vercel.json`: união dos bloqueios da M24/M25 e bloqueio da M26, antes de publicar a branch. Nenhum deploy manual.
- `docs/PLANEJAMENTO-TECNICO.md`: preservadas integralmente as prioridades de vento por localização e campanha de obras reais.
- Código funcional M25 importado: workbench, quantitativos, comprimentos declarados, simulação de corte, PDF e Excel. Sem modificação dos cálculos/exportadores. O teste mobile M25 passa a usar 375 px, mais estreito que os 390 px anteriores.
- M22/M23/M24 e seus contratos de análise permanecem. O Python não recebe nova matemática, tolerância, carga, vínculo ou rigidez.

## Recuperação contínua auditada

Contrato novo: `jpn.continuous-demands/1`, em SI. Usa `jpn.member-demands/1` para validar identidade, revisão, resultado, segmentos, cobertura original e estações; `jpn.member-end-actions/1` fornece R real do PyNiteFEA 3.2.1. Solicitações locais nunca são somadas como se fossem globais. O hash inclui entrada, preparação, resultado completo e telemetria.

Inspecionados na instalação real: `Member3D._segment_member`, `BeamSegZ`, `BeamSegY`, incluindo convenções opostas das curvas My/Mz e expressões de primeira ordem. [Documentação complementar PyNite](https://pynite.readthedocs.io/en/latest/member.html); a versão efetivamente auditada é a instalada 3.2.1. Não se usaram apenas máximos fornecidos pela própria biblioteca como oráculo.

Defina `a[0..11]` como ações locais nativas do nó sobre o membro, L em metros e q como a soma das UDL efetivas na combinação, expressas nos eixos locais reais. Cargas globais são transformadas por R, com fatores da mesma combinação. Peso de pórtico é UDL; peso axial já está nos nós e não é reaplicado.

As funções recuperadas são:

```
N(x)  = -a0 - qx*x
Vy(x) = -a1 - qy*x
Vz(x) = -a2 - qz*x
T(x)  = -a3
My(x) = -a4 - a2*x - qz*x²/2
Mz(x) = -a5 + a1*x + qy*x²/2
```

Os seis valores em L precisam coincidir com as ações nativas da outra extremidade; todas as cinco amostras legadas também são confrontadas. Incompatibilidade produz erro explícito, não ajuste do solver. Barras axiais têm N constante e demais componentes null, conforme o modelo bilateral atual.

Para deslocamentos, integra-se a curvatura e a deformação axial com E/A/I físicos e translações nativas transformadas para os eixos locais. Em `u=x/L`, os coeficientes são:

```
dx: c0=dx_i; c1=-a0*L/(EA); c2=-qx*L²/(2EA)
dy: c0=dy_i; c2=-a5*L²/(2EIz); c3=a1*L³/(6EIz); c4=qy*L⁴/(24EIz)
dz: c0=dz_i; c2= a4*L²/(2EIy); c3=a2*L³/(6EIy); c4=qz*L⁴/(24EIy)
dy/dz: c1=d_j-d_i-c2-c3-c4
```

Não se interpola rotação nodal sobre uma extremidade liberada. Translações de ambas as extremidades e as cinco deflexões nativas conferem o campo integrado. O contrato v1 sem deflexões internas auditáveis retorna deslocamento contínuo `unsupported`. O axial não ganha deslocamento transversal/rotação internos fictícios.

Flecha relativa calculada: subtração da reta entre translações dos extremos **de cada segmento**. Não equivale automaticamente à flecha relativa da peça inteira, sobretudo se houver apoio/movimento intermediário. Norma do vetor deslocamento e limites SLS não estão verificados.

### Localização e simultaneidade

Em u∈[0,1], avaliam-se extremidades e raízes reais das derivadas de cada componente. Para os polinômios de deslocamento de grau até quatro, as raízes de grau até três são isoladas por partição nos extremos da derivada e bisseção, incluindo raízes tangentes. Coeficientes constantes/zero precisam apenas das extremidades. Não há malha densa apresentada como solução exata.

A guarda de coeficientes usa `64*epsilon_maquina*Σ|coeficiente|`; até 60 bisseções no intervalo normalizado. Isso trata arredondamento, não constitui tolerância estrutural. Reconciliação de esforços: 1e−7 N/N·m + 1e−9 relativo; translações: 1e−12 m + 1e−9 relativo. São controles de reconstrução em dupla precisão, separados das tolerâncias do solver, que não mudaram. Não se usam percentuais universais de aceitação de benchmarks.

Cada posição crítica conserva **todo** o vetor N/Vy/Vz/T/My/Mz da mesma combinação e posição, x no segmento e na peça original, fração original, identidade de ambas as faces de cortes e origem dos eixos. Máximos mínimo/máximo/absoluto referenciam linhas completas. Deslocamentos locais e relativos têm extremos separados por componente. A união desses pontos **não** garante o máximo de uma futura interação resistente: `interactionStatus=unsupported`.

Suporte: primeira ordem elástica, seção constante por segmento, cargas translacionais uniformes por todo o segmento, cargas nodais e liberações já aceitas pelo solver atual. Não há suporte silencioso para cargas parciais/lineares/pontuais internas, P-Delta, distribuição de torque, deformação por cisalhamento ou empenamento.

## Propriedades físicas e ligações

`jpn.cold-formed-properties/1` é um cadastro opcional dentro da preparação resistente, compatível com backups existentes. Piloto Ue: fonte/revisão/responsável, origem da seção, dimensões externas do aço, eixos centroidais principais alinhados aos y/z locais, espessuras nominal/efetiva, larguras planas, A, centroide, Iy/Iz/Iyz, quatro módulos de seção assinados por face, J, empenamento, centro de cisalhamento, raios, orientação, propriedades efetivas com método/estado de tensões, comprimentos e contenções/condições de empenamento.

Cada quantidade conhecida tem valor e resolução absoluta na unidade do campo; desconhecido permanece null. Intervalos de resolução conferem A/I/J contra o solver e `r=10*sqrt(I_cm4/A_cm2)` em mm. Verificam-se material isótropo E/G/ν, espessura efetiva versus nominal, larguras planas para a geometria externa com dobras declaradas, raio, proporções Ue, Iyz e contenções fora da peça. Isso é **conferência de consistência declarada**, não cálculo completo da seção arredondada ou validação de propriedades efetivas normativas. Valores sintéticos em testes não são catálogo de obra.

O formulário existente ganha cadastro Ue com resolução, fontes e confirmação explícita dos eixos, sem preencher números. Propriedades efetivas e contenções avançadas persistidas são preservadas; seu preenchimento detalhado continua no contrato técnico, sem novo editor gráfico. Cadastros antigos continuam válidos como dados incompletos. Mudanças invalidam a análise e os relatórios.

`jpn.connection-transfer-geometry/1` é uma extensão opcional de `jpn.connections/1`: furos identificados, componente/peça, coordenadas, diâmetro, distâncias às bordas, espaçamentos com referências entre furos, áreas bruta/líquida declaradas, caminho de seção/força, excentricidades e fixação. Recusa duplicação, referências órfãs e área líquida maior que a bruta. O texto legado `holesAndDistances` não gera dimensões, área líquida ou resistência. Não há cálculo automático de seção líquida, shear lag, soldas ou parafusos. O editor M24 preserva a extensão ao revisar os outros dados.

`jpn.resistance-report/1` mantém seu escopo parcial e recebe dados opcionais de solicitações contínuas/prontidão. As estações originais continuam identificadas como amostradas; não mudam de significado. Procedimentos normativos implementados continuam uma lista vazia, resistência/utilização null e aprovação false. A string de norma ou o preenchimento total do cadastro não habilita aprovação. A opção “Calcular ações de ligações” fornece a telemetria necessária; a análise comum continua disponível, com contínuos indisponíveis nessa execução. Exportação reconstrói os hashes e recusa revisão obsoleta.

## Referências normativas realmente consultadas

Consulta em 02/11/2026:

| Norma/edição candidata | Evidência obtida | Limite |
| --- | --- | --- |
| NBR 14762:2010 | [Catálogo DIN, CURRENT](https://www.dinmedia.de/en/standard/abnt-nbr-14762/180821430) | Não foi obtido o procedimento integral licenciado |
| NBR 6355:2012 | [Catálogo DIN, CURRENT](https://www.dinmedia.de/en/standard/abnt-nbr-6355/180848582) | Tabelas/equações integrais indisponíveis |
| NBR 8800:2024 VC:2025 | [Comunicado ABECE](https://site.abece.com.br/nbr-8800-tem-versao-corrigida-publicada/) | Metadado editorial, não equações |
| NBR 6123:2023, correção 2025 | [Errata 1 de 08/04/2025](https://www.dinmedia.de/en/standard/abnt-nbr-6123-errata-1/392191276) | M22 permanece com parâmetros declarados |
| NBR 8681:2025 | [Comunicado ABECE](https://site.abece.com.br/em-vigor-a-nova-nbr-8681/) | Combinações/fatores ainda não homologados |

O [ABNT Catálogo oficial](https://abntcatalogo.com.br/default.aspx) e sua busca avançada foram acessados. Os links nesta consulta retornaram a interface de busca, sem confirmar de forma conclusiva todos os registros individuais/erratas. A confirmação editorial final no catálogo oficial e a consulta às cláusulas permanecem pendentes; não se declara que a lista acima foi integralmente confirmada na ABNT.

A [biblioteca oficial CBCA](https://www.cbca-acobrasil.org.br/site/biblioteca/?bsc=ativar&bscPgn=2&bscQtdReg=10&chkCat%5B%5D=7&txtBscKeyword=) exige login para o download. Não foram criadas contas, compradas normas ou usados espelhos para contornar acesso. **Cláusulas/equações resistentes ABNT efetivamente implementadas: nenhuma.** Tração completa exige condições de ligação/seção líquida/efetiva/fatores pertinentes; Euler ou escoamento bruto não suprem os modos faltantes. Compressão Ue, flexão, cisalhamento, interações e ligações continuam bloqueados.

### Candidatos de benchmark

O manifesto de cinco candidatos do #34 foi preservado, sem promover qualquer item a golden. Para o exemplo CBCA 04 faltam consulta legítima integral, raio/propriedades/condições de empenamento e procedimento completo para equivalência; não se reproduziu sua resistência a partir de dados inventados.

O [artigo original UPF/Revista de Ensino de Engenharia](https://revista.abenge.org.br/index.php/abenge/article/download/1807/1012/3472) foi consultado no editor, com inspeção visual das páginas PDF 8/9 (impressas 10/11). Confirmadas as comparações das tabelas 5/6 e a continuação da tabela 7, com diferenças entre programas. O cabeçalho de flexão impresso e a unidade mostrada na interface não foram conciliados; referências de flexão continuam em quarentena. Não houve conversão por magnitude, seleção de um software como verdade ou comparação JPN de resistência sem equivalência. `referenceCandidateGate` impede usar esses candidatos como pass/fail, inclusive se o flag utilizável for alterado em um item ainda em quarentena. Comparação de referência futura não será aprovação normativa.

## Referências matemáticas independentes

- Viga engastada/apoiada L=4 m, E=200 GPa, Iz=1e−5 m⁴, qy=−100 N/m. Reações: 5|q|L/8 e 3|q|L/8. Mz(x)=q(L²/8−5Lx/8+x²/2); extremo interno em 5L/8=2,5 m, Mz=+112,5 N·m, entre estações antigas de 2 e 3 m (100 N·m). Flecha `q*(x⁴/24−5Lx³/48+L²x²/16)/(EI)`, extremo em `(15−sqrt(33))*L/16`, também entre estações.
- Mesmo caso dividido em 1,3+2,7 m: posições críticas recuperadas na peça original e ambas as faces do corte preservadas, sem rótulas adicionadas.
- Viga simplesmente apoiada: M(x)=q*x*(L−x)/2 em módulo, flecha central `5qL⁴/(384EI)`. Balanço: momento `q(L−x)²/2`, flecha `qx²*(6L²−4Lx+x²)/(24EI)`.
- Força axial de ponta 1234 N, UDL axial 40 N/m e torque 20 N·m simultâneos: `N(x)=1234+40*(4−x)` e T=20 para a combinação positiva; segunda combinação multiplica tudo por −2. Não se misturam vetores de combinações diferentes.
- Seção girada 37°, cargas locais versus globais equivalentes e balanço inclinado na direção (2,3,4), com pontos não amostrados 0,37/1,41/3,19 m. Inclinação e eixos reais não são inferidos da aparência 3D.
- Cobertura gerada M22/M24: 132 nós, 207 peças, 243 segmentos, quatro combinações; solicitações contínuas coexistem com ações de junta equilibradas e com o dossiê M25 inalterado. Caso separado de peso próprio misto confere UDL de pórtico e concentração nodal axial sem duplicação.

Esses são controles sintéticos de matemática, sem representar projeto comercial dimensionado. Casos instáveis, unidades, apoios/liberações e geometrias degeneradas continuam cobertos pela suíte anterior do motor real.

## Execução e evidências

Windows; Python 3.12.10/PyNiteFEA 3.2.1 reais, NumPy 2.5.4, SciPy 1.18.1, Node 24.13.0 e pnpm 12.15.0. OPENBLAS_NUM_THREADS, OMP_NUM_THREADS e MKL_NUM_THREADS=1. `JPN_PYTHON_EXECUTABLE` aponta para o mesmo Python configurado. Nenhuma dependência de projeto foi modificada.

Comandos, resultados, tempos, fontes e hashes: [validation/mission26/checks.json](validation/mission26/checks.json). Baseline integrada dirigida: 25 aprovados. Validação final Python: 1473 aprovados, zero falhas/erros/skips, mais campanha existente de 1000 comparações independentes, 67,50 s. Auditoria de carregamentos e DXF aprovados. Vitest completo: 342 aprovados, zero falhas/pendentes. TypeScript/lint aprovados. Playwright completo: 70 aprovados, zero falhas/skips/flaky, 405,14 s; build aprovado. Os fluxos incluem 375/1440 px, relatório contínuo real/exportação, cadastro Ue/invalidação, seleção 3D e documentos M25.

Casos de bloqueio conferidos: perfil incompleto, dimensões incompatíveis, A/I/J/raios incoerentes, contenções ausentes/fora da peça, material incoerente, fontes normativas ausentes, extremo indisponível no v1, resultados/telemetria adulterados ou obsoletos e candidatos com unidades suspeitas. Resistência insuficiente em procedimento ABNT completo não foi testada: tal procedimento não existe nesta entrega. Não se confunde teste de bloqueio com validação de uma equação resistente.

Pendências: texto normativo integral legitimamente acessível e revisão de cláusulas; exemplos fisicamente equivalentes; cálculo completo da seção Ue/arredondamentos/espessuras efetivas; propriedades efetivas dependentes de tensões; detalhamento integral de contenções/furos/ligações; interações resistentes e respectivos máximos contínuos; ações/combinações normativas; segunda ordem; campanha global com obras; smoke HTTP remoto. Linux depende da CI do novo commit. Sem liberação de engenharia, compra, corte ou fabricação.


| Comando | Resultado final | Observações |
| --- | --- | --- |
| `pnpm vitest run` (M23/M24/M25 dirigidos) | 25 aprovados | Baseline integrada antes do incremento. |
| `pnpm vitest run src/domain/continuous-demands.test.ts` | 8 aprovados na suíte final | Python real; raízes, vigas, segmentação, eixos, sinais, axial/torção simultâneos e legado. |
| `python engine/validate.py` | 1473 aprovados; 0 falhas/erros/skips | 1000 comparações independentes adicionais; 67,50 s. |
| `python engine/audit_loading.py` | exit 0 | Carregamentos reais, peso próprio, referências analíticas e equilíbrio. |
| `pnpm typecheck` | exit 0 | Código final. |
| `pnpm lint` | exit 0 | Sem erros/avisos. |
| `pnpm test --reporter=json` | 342 aprovados; 0 falhas/pendentes | Inclui os 7 testes M25 e 14 testes novos M26; os casos repetidos não são somados como testes novos. |
| `python tests/verify_dxf.py` | exit 0 | ezdxf 1.4.5: 130 linhas 3D, mm, sem erros. |
| `pnpm test:e2e --reporter=json` | 70 aprovados; 0 falhas/skips/flaky | 405,14 s; um worker Chromium. |
| `pnpm build` | exit 0 | Build completo após Playwright. |

Não houve falhas de testes nas rodadas executadas desta missão; o bloqueio corrigido foi a limitação conhecida de amostragem, demonstrada pelas referências acima. Não se alteraram expectativas ou tolerâncias para ocultar falhas.

Tempos de testes não são SLA ou benchmark isolado do novo módulo. A recuperação contínua não executa outro Python/solver: deriva os resultados da mesma execução. Os limites de processo, memória, entrada/saída, timeout e autenticação são os anteriores. Não foi medida uma nova curva de consumo de memória nem o desempenho no limite máximo de 320 segmentos/10 combinações.

**Veredito local: APROVADO COM RESSALVAS para o escopo parcial de integração e precondições matemáticas. A etapa normativa resistente não foi concluída.** CI do novo commit deve ser verificada separadamente; não se atribui a esta entrega a aprovação remota da base. Permanecem bloqueadas resistência de peças/ligações, aprovação global e fabricação.

Na conferência final foram reforçados os testes de sinais assinados My/Mz e acrescentado um caso explícito de liberações flexionais nativas. Os 8 ensaios de extremos passaram e a suíte Vitest completa foi repetida com 342 aprovações, seguida de TypeScript/lint. O código da aplicação permaneceu o mesmo do Playwright/build aprovados. Seleção 3D foi conferida pelo controle acessível e sincronização do marcador; raycast/toque direto ainda não foi automatizado.
