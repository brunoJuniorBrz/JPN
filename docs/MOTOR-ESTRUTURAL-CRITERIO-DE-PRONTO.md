# JPN — Critério de pronto do motor estrutural (campanha única M27–M30)

**Preparado em:** 02/11/2026  
**Base congelada para este contrato:** PR #35 / `feat/m26-integrated-normative-engine`, commit `51273a29f89fe5c366d837411d8f452d4c7a7547`.  
**Prioridade:** MOTOR ESTRUTURAL. Sem CAD avançado, novo orçamento, novos temas UI, AI ou otimização de compra enquanto este gate não estiver satisfeito.  
**Estado atual:** M26 parcialmente implementada; **JPN ainda NÃO aprovado para dimensionamento resistente, construção ou fabricação**. Este arquivo é contrato de aceitação e plano, não implementação.

## Definição objetiva de pronto

Um motor está **PRONTO PARA UM ESCOPO DECLARADO** somente quando uma obra dentro desse domínio consegue passar pela cadeia completa

`geometria física → materiais/seções físicas → ações e combinações normativas válidas → modelo estrutural/apoios/rigidez/ligações → solicitações concomitantes → verificação ULS+SLS de TODAS as peças e modos aplicáveis → estabilidade/segunda ordem pertinente → ligações/apoios/transferência → integridade/relatório auditável → benchmark externo independente → revisão do engenheiro habilitado quando exigida`.

A saída por peça e ligação deve ser `PASS` ou `FAIL` **apenas** quando TODAS as verificações aplicáveis estiverem realmente implementadas, fundamentadas e exercitadas por testes independentes. Caso haja dado, método, edição normativa, hipótese, cenário físico ou referência faltante, o **modelo não está no escopo concluído e a execução deve bloquear a emissão de aprovação**. Casos não suportados são recusados com motivo explícito; **não são chamados de prontos ou seguros**. `PASS` do software não é ART/validação legal e não substitui revisão e responsabilidade técnica quando aplicáveis.

**Proibido:** alterar flags para simular `approved`, inventar dados ou constantes, construir só uma interface, implementar apenas Euler ou N/A e chamá-lo completo, ou apresentar resultados de modelos simplificados como se o conjunto da obra tivesse sido verificado.

## Escopo mínimo fechado proposto — confirmar/aprimorar pelo Codex com provas

**Tipologia:** coberturas usuais **uma e duas águas**, retangulares, com treliças de barras predominantemente axiais, terças, pilares e sistema de contraventamento **explicitamente modelado**; perfis U enrijecidos formados a frio para terças/peças aplicáveis e perfis I/W laminados/soldados para pilares/vigas quando existirem fontes normativas; bases, juntas articuladas e ligações padronizadas somente nas configurações cujos modos resistentes completos foram implementados. **Não presumir** que tesoura possui nós articulados se o projeto físico usa soldas rígidas. Limites geométricos devem emergir de verificações físicas e de domínio normativo, **não de um vão máximo inventado**.

**Fora do escopo até implementar e validar expressamente:** coberturas curvas, geometrias irregulares, pórticos sem travamento explícito, ponte rolante, mezaninos, cargas dinâmicas especiais, incêndio, corrosão/fadiga, fundações geotécnicas e estruturas/fundações de concreto não modeladas. **Interfaces** com fundações devem emitir reações/sinais corretos e exigir comprovação independente da capacidade das fundações; ligações da base só podem ser aprovadas se o sistema chapa/chumbadores/concreto realmente suportar os modos pertinentes. Não classificar o conjunto como aprovado caso a segurança dependa de subsistema não verificado sem interface/revisão formal. Obras abertas/fechadas e vento interno requerem identificação física explícita, nunca coeficiente genérico.

**Critério de uso pelo Ton:** uma obra do tipo suportado deve ser cadastrada com medidas, perfis, materiais, travamentos, nós, apoios, sistemas de ligação, vento, demais ações e hipóteses; executar; consultar relatório de peça/combinação/modo crítico; identificar peças reprovadas; corrigir e recalcular; guardar/recuperar revisão e exportar memória de cálculo com rastreabilidade. O software não pode exigir programação, edição de JSON ou manipulação de código para fluxos declarados de uso comum. **Inputs indispensáveis podem ser numerosos, mas precisam ser recolhidos e validados por controles funcionais; nenhuma hipótese oculta.**

## Base técnica e pendências que DEVEM ser resolvidas nesta campanha

### A — Corrigir o pós-M26 e fechar integração
- Revisar e corrigir achados da auditoria PR #35: `verifications[].demandCoverage` ainda indica `sampled-stations-only` com extremos contínuos presentes; mensagem SLS ainda afirma que cinco pontos impedem extremos mesmo com série contínua; `coldFormedDiagnostics` aplicado a não Ue rotula famílias como unsupported; valores resistentes ainda comparados por `!==` apesar de resolução declarada; rótulo de verificação contínua da peça pode mascarar deslocamentos v1 unsupported.
- Conferir integridade dos `jpn.member-end-actions/1`, `jpn.member-demands/1`, `jpn.continuous-demands/1` e `jpn.connection-report/1`; reconstrução de hashes, proveniência de cargas, combinações e edição.
- Preservar M25 e seus PDFs/XLSX/dossiês como **preliminares**. Não alterá-los para realizar o gate.
- Conferir CI final da M26 para o SHA exato; não pressupor verde pelo push anterior.

### B — Ações/combinações e vento
- Selecionar edições aplicáveis e confirmar **textos completos legítimos e erratas**: NBR 6123:2023 (versão corrigida/errata a verificar), NBR 8681:2025, NBR 6120 (edição vigente verificar), além dos requisitos específicos de NBR 8800/14762.
- Implementar casos e combinações ULS/SLS, permanentes, sobrecarga de cobertura/manutenção, vento externo e pressão interna, sucção, direções e zonas de pressão e suas áreas tributárias, peso próprio e casos relevantes ao escopo. Entradas de exposição, local, topografia, dimensões, fechamentos e fatores devem ser explícitas e rastreáveis. Nunca presumir GPS como único modo de obter vento; permitir premissas verificadas com fonte.
- Ensaios independentes para resultantes global+por peça, momento com origem, áreas tributárias, inversão de sinais/sucção, caso favorável/desfavorável, combinações e reações. Não usar apenas conservação de força como validação de coeficientes normativos.

### C — Resistência de TODAS as famílias e modos declarados suportados
- Ue NBR 14762 e I/W NBR 8800 somente se houver fonte normativa íntegra legítima e exemplos equivalentes. Para cada geometria e estado-limite pertinente: tração (bruta/líquida/ligação), compressão (global local distorcional flexotorção conforme seção), flexão (local/global/lateral-torcional), cisalhamento, torção, esforços concomitantes e interações, esmagamento/concentrações quando aplicável, flecha e serviço, limite de esbeltez, contenções reais, propriedades e excentricidade.
- Calcular o ponto governante da **função de interação** e da flecha relevante para a **peça inteira**, não apenas a união dos máximos isolados por componente em cada segmento. Validar métodos analíticos/numericamente com limites de erro independentes e convergência.
- Propriedades físicas de seção e efetivas dependentes do estado de tensões: algoritmo verificável ou proveniência e compatibilidade auditadas. Não fingir cálculo de largura efetiva a partir de nome comercial.
- **Toda combinação** pertinente e cada modo aplicável devem ser visitados, inclusive resultado de aprovação e reprovação. No escopo fechado, ausência de um modo aplicável **bloqueia liberação total**, não conta como green.

### D — Estabilidade e segunda ordem
- Identificar mecanismos com diagnósticos rastreáveis, contraventamento/contensão real, deslocamentos e imperfeições quando prescritos, global/local, efeitos de segunda ordem e combinações pertinentes. Verificar corretamente (P\!\Delta) e (P\!\delta) quando exigidos; usar PyNite P-Delta apenas **após testes independentes** do conjunto misto, releases e cargas suportadas.
- Separar convergência numérica de **estabilidade normativa** e limites de deslocamento/drift. Caso requerer procedimento ainda não suportado, bloquear estrutura inteira no escopo de liberação.

### E — Ligações completas do domínio suportado
- Recuperar simultaneamente N/V/T/M da M24 e combinar corretamente no detalhamento físico; verificar parafusos, furos, arranjos, distâncias de borda e passo, soldas, chapas, ruptura/arrancamento/bearing/block shear e estados pertinentes, emendas, bases/ancoragens e transferência para a fundação.
- Valores declarados de `grossArea`, `netArea`, `pitches` e distância ao bordo não são resultados computados. Calcular/geometricamente verificar em relação às coordenadas reais; rejeitar colisões e inconsistências. Validar soldas em carga combinada e ações excêntricas onde aplicável.
- Ações e resistências devem corresponder ao modelo de rigidez e liberação: ligação semirrígida não pode ser declarada rigid/pinned silenciosamente. Cortes internos numéricos não são emendas.
- Tipos de junta não implementados devem bloquear a declaração de obra completa, com decisão explícita sobre exclusões do domínio fechado.

### F — Testes independentes, benchmark de obras e regressões
- Campanha já registrada em `docs/VALIDACAO-OBRAS-REFERENCIA.md` (PR #32 incorporado à M26): UBS Conselvan; manual CBCA Anexo D; UFMG/Vale; cobertura escolar UFMG 2025; IF Goiano. **Não tratar obra de referência antiga ou estudo acadêmico como norma/verdade absoluta.**
- Adicional de alta relevância: [UTFPR — galpão industrial em perfis formados a frio, 2018](https://repositorio.utfpr.edu.br/jspui/handle/1/15115), monografia com memória de cálculo e aplicação NBR 14762:2010; **vento de 1988 não é benchmark equivalente ao vento 2023**. Transcrever hipóteses antes de comparar.
- Selecionar **mínimo dois modelos de cobertura/galpão independentes suficientemente especificados**, um de complexidade baixa/média e um com esforço de vento/estabilidade mais exigente; registrar fonte, edição, revisão, geometria, perfis, rigidez, apoios, ações, cada combinação e resultado. Caso material público seja insuficiente, obter casos de projeto completos de engenheiro autorizado; **nunca inventar condições ausentes ou rebaixar tolerância para atingir verde**.
- Cada método normativo suportado exige: teste analítico independente PASS, FAIL e limites; testes de sinais/unidades/perfis orientados/released/múltiplas combinações; casos de erro de entrada e modelo; comparação de solução estruturada e norma/documentação consultada; regressão PyNite real, campanha sintética existente de 1000 modelos, Python Linux/Windows, Vitest, TypeScript, lint, Next build, Playwright 375/1440, export PDF/XLSX/DXF, backup/revisão/stale.
- Performance e robustez: benchmark da cobertura com 132 nós / 207 peças / 243 segmentos existente; medir tempo/memória/response payload e limites reais com margem, não relaxar proteções de rede.
- Um valor de referência é gabarito só após reconciliação de unidade, geometria, fatores e método; as referências UPF com possível unidade de flexão errada continuam em QUARENTENA.

## Fontes primárias e educacionais pesquisadas em 02/11/2026

1. [ABNT Catálogo — norma NBR 8800:2024 Versão Corrigida:2025](https://abntcatalogo.com.br/default.aspx). Documento técnico **comercial licenciado**; compra/acesso legítimo e conferência do texto integral são dependências reais.
2. [ABECE — correção NBR 8800 em 2025](https://site.abece.com.br/nbr-8800-tem-versao-corrigida-publicada/). Informa que houve alteração de **algumas fórmulas**, não só numeração.
3. [ABECE — NBR 8681:2025](https://site.abece.com.br/em-vigor-a-nova-nbr-8681/). Ações/segurança, substituiu 2003.
4. [ABECE — NBR 6123:2023](https://site.abece.com.br/em-vigor-a-nova-nbr-6123/). Confirmar erratas/versão corrigida no catálogo oficial.
5. [CBCA — biblioteca técnica; "Uso Fácil - ABNT NBR 8800:2024" lançado em 11/12/2025](https://www.cbca-acobrasil.org.br/site/biblioteca?bsc=ativar&bscPgn=1&bscQtdReg=10&chkCat%255B%255D=7). Material complementar **atualizado**, mas não substitui a norma integral.
6. [CBCA — curso atualizado NBR 8800:2024](https://www.cbca-acobrasil.org.br/site/curso-online/dimensionamento-de-estruturas-de-aco-atualizado-segundo-nbr-8800-2024). Programa cobre tração, compressão, flexão, cisalhamento e interação.
7. [CBCA — ligações usuais](https://www.cbca-acobrasil.org.br/site/curso-ao-vivo/dimensionamento-de-ligacoes-2024). Exemplos educativos de parafusos/soldas/chapas/bases; verificar ano da edição do procedimento aplicável.
8. [UFAL/eduCAPES — notas de aula sobre flexão de perfis formados a frio](https://educapes.capes.gov.br/bitstream/capes/572685/2/5%20-%20PFF%20-%20FLEX%C3%83O%20SIMPLES%20-%20NOTAS%20DE%20AULA.pdf). Material educacional de 2020 baseado em NBR 14762:2010, não o texto normativo integral.
9. [UTFPR — dimensionamento de galpão de perfis formados a frio](https://repositorio.utfpr.edu.br/jspui/handle/1/15115). Referência acadêmica, vento NBR 6123:1988, comparar somente hipóteses equivalentes.

**Aviso de procedência:** links identificam recursos consultáveis, não autorizam replicar publicações protegidas nem certificam acesso às cláusulas exatas. Se o agente não dispuser de normas licenciadas aplicáveis, **não poderá cumprir o requisito de declarar o motor normativo pronto**. Deve implementar tudo que puder fundamentar, explicar objetivamente a dependência e pedir o texto/credenciais autorizadas; **nunca trocar esta obrigação por fórmulas assumidas ou por uma flag que força aprovação**.

## Entrega exigida no GitHub

Criar branch única de implementação partindo do SHA **exato** da M26 ou desta branch documental, PR draft **sem merge/deploy**. Armazenar:
- `docs/ENGINE-SUPPORTED-DOMAIN.md`: tipologias, famílias, normas/edições, componentes, inclusões e exclusões, prova de cada item.
- `docs/ENGINE-NORMATIVE-TRACEABILITY.md`: por procedimento, edição, cláusula, método, entrada, resultado intermediário e evidência; **não copiar conteúdo integral da norma**.
- `docs/ENGINE-RELEASE-GATE.md`: matriz da cadeia completa, resultados, hashes, benchmarks, divergências, responsáveis e status.
- `docs/validation/engine-release/`: casos de verificação com proveniência, fixtures estruturadas, comparações e CI.
- Relatório da missão com testes reais executados e códigos de falha, exemplos que passam e que **reprovam**, revisão de segurança, perfil de performance e lista de funcionalidades que não entram no escopo de aprovação.

**Sem "aprovação com ressalvas" para o domínio que for declarado PRONTO.** O domínio completo tem de passar todos os gates. Se falhar, status oficial é **NÃO PRONTO — bloqueado**, ainda que as alterações técnicas sejam valiosas. Não alegar engenharia certificada apenas pela automação.

## Checklist mínimo (não substituir por número de testes)

- [ ] Fontes normativas completas/legítimas e edições erratas rastreáveis por cada método.
- [ ] Geometria, materiais, propriedades reais, apoios/ligação/contraventamento coerentes e inspeção do modelo sem ambiguidade.
- [ ] Ações/vento e combinações ULS/SLS de todos os casos aplicáveis.
- [ ] Solver com equilíbrio, rigidez, orientações e versões testadas independentemente.
- [ ] Resistência de TODOS os elementos e modos pertinentes ao domínio.
- [ ] Interações concomitantes e esforços críticos realmente localizados.
- [ ] Flecha/ELS e estabilidade global + segunda ordem quando exigidas.
- [ ] Ligações, bases/ancoragens e interfaces com a fundação verificadas até o limite declarado.
- [ ] Um ensaio de aprovação e um de reprovação para **cada** modo implementado, mais testes adversariais.
- [ ] Dois casos de cobertura/galpão reproduzidos com hipóteses equivalentes e confrontados com engenharia independente.
- [ ] Scripts e CI da integração completos; sem falha/salto não explicado, Windows/Linux quando relevante.
- [ ] Fluxo real operável pelo Ton sem edição de JSON/código para domínio declarado.
- [ ] Nenhuma fabricação presumida; requisitos de revisão/responsabilidade técnica separados.
