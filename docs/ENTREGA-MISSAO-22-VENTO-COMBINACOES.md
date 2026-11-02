# Missão 22 — vento zonal e combinações declaradas

## Estado e base Git

Entrega experimental parcial da sequência M22–M24. A cadeia física de vento suportada está implementada; seleção normativa de coeficientes, geração automática de combinações ABNT, resistência e ligações não estão homologadas nem concluídas.

Base exata: `integration/m21-studio-release-candidate`, commit `92b9a2836e9cdb50553f98173f300e425acef877`, PR #28. Na inspeção de 02/11/2026, estava aberto em rascunho, mergeável, com CI **success** nos jobs application, structural Ubuntu e structural Windows ([execução 41451828840](https://github.com/brunoJuniorBrz/JPN/actions/runs/41451828840)). A `main` continuava em `01caa9f2c5fd6f38b2d98769f597d9b73aaee359`. A integração inclui o caminho M21, auditoria independente, referências elásticas do PR #26 e Studio 3D. Nada disso foi reimplementado.

Branch desta entrega: `feat/engineering-m22-m24`, descendente direto dessa base. O diretório recebido não possui `.git` nem executável Git disponível. Foi preparado um snapshot isolado em `.tools/mission22-worktree`, com arquivos conferidos pelos hashes Git da árvore remota; publicação pela conexão GitHub. A pasta original foi preservada. Os dois `vercel.json` desabilitam o deploy Git da nova branch antes de sua publicação. Sem merge ou deploy manual.

## Implementação real

- `jpn.wind-roof/1`: localização, velocidade básica e referência, terreno, rugosidade, topografia, descrição de fatores, fechamento/aberturas, hipótese interna, incidência, aplicabilidade estática, fontes, revisão e responsável. Geometria ligada à assinatura já existente do projeto; planos, cotas, limites e inclinações vêm da geometria gerada, não de valores presumidos.
- Casos com **q declarado em Pa**, coeficientes externo/interno e zonas retangulares por água. `q` não é calculado a partir da velocidade cadastrada. Não se escolhem isopletas, fatores, tabelas ou coeficientes. A incidência é metadado do caso; não gera coeficientes aerodinâmicos.
- Pressão líquida `q × (cpe − cpi)`, positiva para dentro. Tração superficial global `−p × n_exterior`, onde `n_exterior = (−dz/dx, −dz/dy, 1)/norma`. Sucção negativa atua para fora. A medida é a área inclinada real, não sua projeção horizontal. Coeficientes precisam corresponder a essa convenção declarada.
- `jpn.wind-load-path/1`: conserva áreas, forças e os três momentos globais **por zona**, preservando casos, coeficientes, fontes, peças, vãos e contribuições. A cumeeira agrega as contribuições das duas águas em uma carga por peça/caso.
- Distribuição por reações de telhamento **explicitamente biapoiado entre terças**. Para um vão `[l,r]`, integra-se `p(r−u)/(r−l)` e `p(u−l)/(r−l)`. A soma das funções vale 1 e reproduz coordenadas lineares: preservam a resultante e seu primeiro momento, inclusive quando uma fronteira de zona atravessa o vão transversal. Não se usa média de pressão de toda a cobertura nem a aproximação de faixas uniformes da M21 para zonas assimétricas.
- Integração ao adaptador existente: terça original → seus segmentos físicos → UDL global em N/m → `jpn.mixed3d/2` → PyNiteFEA 3.2.1. Nenhum segundo solver ou algoritmo de elementos finitos. Reações não são reaplicadas manualmente à estrutura.
- `jpn.engineering-combinations/1`: categorias permanente/variável/vento; grupos exclusivos; finalidade ULS/SLS característica, frequente ou quase permanente; fatores gamma/psi e referência por termo. Todos os casos, inclusive fatores zero, são explícitos. O compilador multiplica gamma × psi, verifica exclusões e confere igualdade com a tabela efetivamente enviada ao solver. **Não contém fatores ABNT automáticos.** Os propósitos são classificações declaradas, não verificações resistentes/de serviço implementadas.
- `jpn.engineering-package/1`: importação atômica pela área técnica existente, com substituição explícita da tabela de combinações. Mantém cargas/propriedades existentes, invalida a revisão de independência das ações e recusa colisões de casos. Os contratos são persistidos e restaurados pelos backups existentes.
- Interface mínima: editor técnico JSON com modelo de campos pendentes, inspeção de forças/momentos/zonas, exportação de rastreabilidade e exemplo sintético separado da obra. Resultados continuam disponíveis no visualizador existente. Nenhuma alteração no planejamento comercial/fabricação.

## Casos suportados e bloqueios

Apenas cobertura retangular gerada de uma ou duas águas, terças paralelas, eixos globais existentes, quatro sentidos de queda e balanços longitudinais declarados. Volume fechado único com uma hipótese de cpi por caso; ação estática apenas na cobertura. As hipóteses aerodinâmicas continuam sob responsabilidade do engenheiro.

Zonas de borda/canto/interior devem ser explicitamente desenhadas como uma partição completa por água: sem lacunas, sobreposições ou superfície órfã, incluindo zonas de pressão zero. A fronteira longitudinal de uma zona deve coincidir com extremos das peças de terça. Se cortar uma peça, a automação é bloqueada: **carga parcial e discretização adicional de zonas ainda não implementadas**. Não se homogeneíza a carga silenciosamente.

Bloqueados: regiões compostas/em L, edifícios abertos ou parcialmente fechados, pressão interna variável no mesmo volume/caso, terças axiais recebendo UDL transversal, geometrias incompatíveis, dados físicos incompletos, mecanismos, duplicidade de ações no mesmo caso e combinações obsoletas/incompatíveis. Todos os casos de vento alternativos precisam pertencer ao mesmo grupo exclusivo. Combinações de ações automáticas com outras cargas exigem revisão rastreável de independência atualizada.

Limites físicos anteriores preservados: 150 nós, 320 segmentos, 640 cargas distribuídas, 10 casos/combinações, worker isolado de 768 MiB e timeout de 20 s. A declaração de vento limita-se a quatro casos e 32 zonas por caso; não são limites normativos. Nenhum limite de estabilidade, tolerância do solver, vínculo ou rigidez foi alterado. A conferência geométrica usa a tolerância existente de 1e−7 m e conservação relativa de 1e−10, escalada por área/força/braço.

Mudanças nas declarações, fatores, fontes, perfis ou geometria modificam a revisão física/hash da entrada e invalidam a sessão da interface. Geometria alterada exige nova associação das zonas. Fatores editados fora da declaração geram `STALE_ENGINEERING_COMBINATIONS`. Os avisos experimentais e `approved_for_fabrication=false` permanecem; as novas saídas também possuem `approved=false` e validação normativa pendente.

## Referências normativas efetivamente consultadas

Consultas de metadados em 02/11/2026, não acesso ao texto integral para implementação:

| Documento | Evidência editorial consultada | Uso nesta entrega |
|---|---|---|
| NBR 6123:2023, correção de 2025 | [Errata 1 de 08/04/2025 — DIN Media](https://www.dinmedia.de/en/standard/abnt-nbr-6123-errata-1/392191276) | Correção identificada; tabelas/figuras e coeficientes não implementados |
| NBR 8681:2025 | [Registro corrente de 24/09/2025 — DIN Media](https://www.dinmedia.de/en/standard/abnt-nbr-8681/396242177) | Sem geração automática de fatores normativos |
| NBR 8800:2024, Versão Corrigida:2025 | [ABNT Catálogo](https://www.abntcatalogo.com.br/default.aspx?P=M6V7DQ6JE0Z9) | Sem novas equações de resistência |
| NBR 14762:2010 | [Registro corrente — DIN Media](https://www.dinmedia.de/en/standard/abnt-nbr-14762/180821430) | Formados a frio não recebem procedimento simplificado de laminados |
| NBR 6120:2019, versão corrigida | [Registro corrente — DIN Media](https://www.dinmedia.de/en/standard/abnt-nbr-6120-versao-corrigida/317309977) | Nenhum peso/ação tabelado presumido |

Alguns links individuais do ABNT Catálogo retornaram validação de acesso/link expirado. Não foram adquiridas normas, acessadas contas particulares nem utilizadas cópias de terceiros como base normativa. **Nenhuma cláusula ABNT foi efetivamente codificada ou validada nesta entrega.** O campo de cláusula fornecido pelo engenheiro registra a origem declarada; o sistema não certifica seu conteúdo. Todos os coeficientes dos exemplos/testes são identificados como sintéticos e não normativos.

## Referências matemáticas independentes

1. Monopendente 6 × 8 m, `z=3+0,25x`, zonas `x=[0;1,3]` com pressão líquida +700 Pa e `x=[1,3;6]` com −400 Pa. Integrais independentes: `S0=−7760 N`, `Sx=−50164 N·m`, `Sy=4S0`, `Sz=3S0+0,25Sx`. Resultado global esperado: **F = [−1940; 0; 7760] N**, **M = [31040; −59119,25; 7760] N·m**. Conferência independente das reações de transmissão na primeira terça, não apenas comparação do algoritmo com sua própria saída.
2. Carga vetorial obtida da zona inclinada aplicada a balanço misto independente de L=4 m, E=200 GPa, Iy=Iz=1e−5 m⁴ e orientação de seção 37°. Fórmulas independentes: `uX/Z=qX/Z L⁴/(8EI)`, `thetaX=qZ L³/(6EI)`, `thetaZ=−qX L³/(6EI)`, reação `−qL`, momento de engaste e V/M intermediários. Uma barra axial longitudinal explícita não introduz rigidez transversal fictícia.
3. Cobertura sintética gerada 10 × 20 × 4 m: 132 nós, 207 peças e 243 segmentos; modelo físico rígido/axial já existente, não treliça comercial dimensionada. q=500 Pa, zonas cpe=0,8/0,2 e cpi=0. Reação vertical total WP=+50000 N, WS=−50000 N; caso duplicado=100000 N; ação permanente independente + WP=70000 N. Reações de força e momento somadas independentemente das coordenadas nodais e momentos de reação, sinais de esforços, deslocamentos e superposição conferidos. Remover todos os vínculos continua produzindo `UNSTABLE` no Python real.
4. Varredura dos quatro sentidos de queda, uma/duas águas, cumeeira e balanços; zonas longitudinais alinhadas e não alinhadas; pressão zero, lacunas, sobreposições, dados não finitos, exclusões, revisão/hash, persistência e backups.

## Evidências e validação

Ver [checks.json](validation/mission22/checks.json) para comandos, contagens, tempos e ambiente efetivamente executados. Baseline direcionada na base exata: 91 testes aprovados. A primeira rodada nova teve duas expectativas incorretas: sentido de queda da referência analítica e distinção `−0/0` após JSON. Foram corrigidas as referências de teste, sem alteração de matemática/tolerâncias. Depois, 17 testes direcionados passaram; a campanha final inclui um 18º caso de pressão líquida zero. Playwright direcionado passou em 375/1440 px, com Python real e invalidação ao editar a declaração.

Resultados finais e CI do novo PR devem ser lidos junto às evidências desta revisão; CI da base não prova a nova branch. Os testes locais usam Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4, SciPy 1.18.1, Node 24.13.0 e pnpm 12.15.0, BLAS/OMP/MKL com uma thread. Tempos de testes incluem inicialização e concorrência com a suíte; não constituem benchmark dedicado nem medição de pico de memória do novo caminho zonal.

A campanha completa Playwright executou 63 cenários: 61 passaram e dois de peso próprio falharam por seletor ambíguo (`structural-loads summary`, agora também encontrando o novo painel aninhado). Corrigido somente o seletor do teste para `:scope > summary`, preservando suas verificações físicas. A repetição direcionada contempla peso próprio e vento em ambas as larguras; seu resultado está nas evidências. Não foi repetida toda a campanha por esse ajuste de seletor, nem ocultadas as falhas iniciais.

| Comando | Resultado local final |
|---|---|
| `python engine/validate.py` | 1444 testes, zero falhas/erros/skips; 1000 comparações independentes; 66,04 s |
| `python engine/audit_loading.py` | Aprovado: balanço, biapoiada, biengastada, peso e equilíbrio independente da cobertura |
| `pnpm typecheck`, `pnpm lint` | Exit 0; lint sem erros ou avisos |
| `pnpm test` | 303 aprovados, nenhum falho/pendente; 18 casos novos de vento |
| `python tests/verify_dxf.py` | 130 linhas 3D em mm, zero erros de auditoria ezdxf |
| `pnpm test:e2e` | Campanha: 61 aprovados / 2 falhas de seletor; repetição afetada após correção: 4/4 aprovados em 54,03 s |
| `pnpm build` | Exit 0 |

Os cenários de regressão executados cobrem 3D/Acabado, quantitativos/comercial, DXF/PDF/planilhas, navegação, persistência/backups e análise anterior. As duas falhas iniciais não eram falhas do cálculo; permanecem registradas. Os testes de viewport não comprovam uso em iPhone físico. Sem execução HTTP remota nova nem deploy para esta missão. A CI da nova branch deve ser acompanhada no PR; não é declarada aprovada por extrapolação da CI da base.

## Pendências M23, M24 e integração futura M25

As referências elásticas/Euler do PR #26 já existiam na base e continuam **não normativas**. Não foi implementada nova resistência, aprovação de serviço, dimensionamento de ligações, ancoragens, contenções ou estabilidade de segunda ordem. Nenhuma dessas missões deve ser considerada concluída por haver contratos de dados.

Próximo incremento de maior impacto: acesso legítimo às cláusulas/tabelas aplicáveis e exemplos independentes para validar seleção de zonas/coeficientes e combinações; depois escolher uma família e uma verificação resistente completa. Cargas em fachadas, verificações locais de telhas/fixadores e todas as verificações obrigatórias de segurança seguem pendentes. Não há autorização para compra, corte ou fabricação.

A Missão 25 pode consumir futuramente IDs originais, hashes, declaração/referências das combinações e esforços dos resultados existentes. Nenhum dos arquivos reservados de corte, CAD, quantitativos, takeoff, dossiê ou `project-workbench.tsx` foi alterado. Esses dados não equivalem a uma lista de fabricação aprovada.
