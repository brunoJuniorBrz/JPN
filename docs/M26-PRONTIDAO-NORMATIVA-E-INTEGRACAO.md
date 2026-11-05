# JPN — Preparação independente da etapa normativa e integração M22–M25

**Pesquisa e inspeção:** 02/11/2026  
**Base congelada para esta preparação:** `feat/m24-connections-stability` `f2c94b7e1ffb1d0e48214ade907b897d0dec8b7c` (PR #33).  
**Status:** especificação de trabalho e referências; **não é motor resistente implementado, parecer de engenheiro, prova de segurança nem autorização de fabricação**.  
**Prioridade técnica:** máxima após o fechamento do motor numérico experimental. A campanha com projetos e memoriais está especificada no PR #32, `docs/VALIDACAO-OBRAS-REFERENCIA.md`, e será executada depois de existirem verificações adequadas.

## 1. Estado observado e decisões

A pilha de PRs está **empilhada**: **PR #28** (`integration/m21-studio-release-candidate`, base `main`) → **PR #30/M22** → **PR #31/M23 parcial** → **PR #33/M24 parcial**. **PR #29/M25** parte **separadamente** da PR #28; **PR #32** de benchmark parte da PR #31. Não confundir seis PRs abertos com seis recursos independentes para fazer merge em `main` aleatoriamente.

**CI do commit final M24**: workflows push **41482052334** e pull_request **41482064909** concluídos com `success` em 02/11/2026, incluindo aplicação e motores Linux/Windows (não equivale a validação normativa). A CI do PR #31 também está verde. M22–M24 incluem análises lineares com PyNite 3.2.1, cargas de vento *declaradas* e mapeadas, solicitações concomitantes **amostradas**, ações de extremidade local→global, equilíbrio e dados físicos de ligações. **Nenhuma família de perfil nem ligação recebeu aprovação normativa.**

**Risco real de integração:** arquivo-base da M25 compartilha com a M24 apenas `vercel.json` e `engine/vercel.json` dentre os arquivos alterados, porque cada branch acrescenta bloqueios de deploy Git. PR #32 compartilha com M25 `docs/PLANEJAMENTO-TECNICO.md`. Mesclar manualmente preservando **a união** dos bloqueios de deploy e de ambas as seções do planejamento. `project-workbench.tsx` e os módulos M25 de quantitativos/PDF/XLSX não colidem diretamente com arquivos alterados na M24, **mas exigem regressão de integração**.

### Sequência sugerida de integração

1. Manter SHAs congelados; criar **uma branch de integração candidata** partindo da M24, não fazer merge em `main` nem publicar.
2. Integrar **apenas** a documentação da campanha PR #32 e os arquivos de pré-fabricação PR #29, resolvendo os três caminhos de sobreposição manualmente. Preservar avisos de não compra/corte, hashes, auditorias e validações.
3. Reexecutar CI completa da branch integrada, comparadores físicos, testes de backup, UI 375/1440 px, regressões PDF/XLSX/DXF e conferência de diferenciação de *preliminar* e *aprovado*. Registrar SHA da integração.
4. Construir o motor de resistência em módulos isolados e versionados, consumindo `member-demands`, `resistance-report`, `connection-report`, **sem alterar silenciosamente PyNite ou as cargas**.
5. Não eliminar PRs sem confirmar cadeia-base e recursos preservados. Não autorizar fabricação.

## 2. Referências normativas — versões a conferir no texto legítimo

| Tema | Edição identificada na pesquisa | Fonte para identificação | Situação no JPN |
|---|---|---|---|
| Barras de perfis formados a frio (U/Ue) | **ABNT NBR 14762:2010**; catálogo de acompanhamento indica confirmação em 11/2023 | CBCA 2014; busca de norma SINAPI; confirmar no catálogo ABNT | Sem verificações resistentes |
| Geometria/padronização de perfis abertos a frio | **ABNT NBR 6355:2012**; confirmação reportada em 02/2025 | CBCA 2014; catálogo de acompanhamento | Geometria física opcional; propriedades avançadas insuficientes |
| Laminados/soldados/tubulares e conexões abrangidas | **ABNT NBR 8800:2024 Versão Corrigida:2025** | Comunicado ABECE fev/2025 + Catálogo ABNT | Sem verificações resistentes |
| Vento | **ABNT NBR 6123:2023 Versão Corrigida:2025**, Errata de 08/04/2025 | Registro de edição e errata; confirmar texto oficial | M22 usa parâmetros declarados, sem homologação da norma |
| Ações e segurança/combinações | **ABNT NBR 8681:2025** | Comunicado ABECE outubro/2025 | Fatores/composições declarados, sem validação normativa integral |

**Referências identificadoras (não são licenças de reprodução de texto integral):**
- NBR 8800 versão corrigida: https://site.abece.com.br/nbr-8800-tem-versao-corrigida-publicada/ e https://abntcatalogo.com.br/default.aspx
- NBR 8681 nova edição: https://site.abece.com.br/em-vigor-a-nova-nbr-8681/
- NBR 6123 original e errata: https://site.abece.com.br/em-vigor-a-nova-nbr-6123/ e https://buscadorsinapi.com.br/normas/nbr-6123-forcas-devidas-ao-vento-em-edificacoes
- NBR 14762/6355 e publicações oficiais: https://www.cbca-acobrasil.org.br/site/biblioteca/ ; https://www.cbca-acobrasil.org.br/site/biblioteca/?bsc=ativar&bscPgn=2&bscQtdReg=10&chkCat%5B%5D=7&txtBscKeyword=
- NBR 6355 registro: https://buscadorsinapi.com.br/normas/nbr-6355-perfis-estruturais-de-aco-formados-a-frio-padronizacao
- NBR 14762 registro: https://buscadorsinapi.com.br/normas/nbr-14762-dimensionamento-de-estruturas-de-aco-constituidas-por-perfis-formados-a-frio

**Fonte de procedimento:** não usar uma notícia, software, postagem ou exemplo parcial como substituto automático das **cláusulas completas, tabelas, hipóteses, exclusões e erratas da norma legitimamente acessada**. O engenheiro precisa disponibilizar/consultar o texto legítimo e confirmar explicitamente método, edição, critérios e referência antes de aprovar uma verificação. **Não baixar, redistribuir nem reproduzir texto integral protegido.** Informar inexistência de acesso quando ocorrer, sem inventar coeficientes.

## 3. Família piloto — U enrijecido (Ue) formado a frio

**Escolha pela relevância para coberturas:** terças U/Ue são recorrentes nas fontes e modelos JPN. Um método completo segundo NBR 14762 para Ue é mais difícil que uma razão N/A ou um cálculo de Euler. Não afirmar que a família está verificada por calcular um único modo.

### 3.1 Dados que precisam existir e ser coerentes

Além da geometria física atual (`height`, `width`, `wallThickness`, `lip`, `insideRadius`), definir e validar com unidade, fonte e revisão:

- Classe de aço, `fy`, `fu`, E, G, ν, densidade; procedência da seção e liga de aço;
- Área bruta, centroide, eixos principais e orientação, Ix/Iy, W elásticos relevantes, J, **constante de empenamento/torção e posição do centro de cisalhamento quando exigidas**, raios de giração e excentricidades;
- Larguras planas, espessura nominal/efetiva e raios das dobras; validade geométrica, proporções e limites de cada procedimento;
- Comprimentos efetivos por modo de flambagem, pontos reais de contenção, flambagem por flexão, torção e flexo-torção; travamento da **mesa realmente comprimida** para o sentido da carga;
- Seção líquida/efetiva, furos, posicionamento e quantidade da ligação, tipo de conexão, transmissão do esforço, excentricidade e coeficientes quando pertinentes. **`holesAndDistances` atualmente é texto livre na M24, insuficiente para automatizar cálculo de área líquida e rupturas**;
- Tipo de combinação ULS/SLS, fatores (fonte e edição), direção do vento/sucção, cargas simultâneas, sinais e tensões nas fibras pertinentes.

**Regras de consistência:** não deduzir resistência de designação visual; não misturar `Iy`/ `Iz` entre convenções; não reconstruir área resistente a partir de sólidos 3D ilustrativos; não tratar flexão/cortante/torção `null` de barra puramente axial como ausência desses efeitos na ligação real.

### 3.2 Procedimentos que exigem cobertura antes de aprovar a peça

- Tração: escoamento na seção bruta; ruptura nas seções líquida/efetiva pertinentes; limite de esbeltez e condição de ligação.
- Compressão: flambagem global nos eixos/modos válidos, **flexo-torção**, instabilidade local da seção e **distorcional** para Ue, hipóteses de vinculação e comprimento de flambagem.
- Flexão: modos de seção local/distorcional e **flambagem lateral com torção**, orientações e contenções reais, momento nas duas direções quando aplicável.
- Cisalhamento, torção, esmagamento/alma/cargas concentradas quando aplicáveis, combinações **concomitantes** e verificações de interação.
- Serviço: deslocamentos e critérios próprios, flecha no local crítico real e combinações SLS.
- Ações de conexão, parafusos/soldas/chapa/apoios e estabilidade global permanecem responsabilidade adicional da M24 normativa.

**Modelo de estados recomendado:** `not-applicable-with-justification`, `pending-data`, `pending-normative-source`, `unsupported-model`, `calculated-but-not-validated`, `verified-pass`, `verified-fail`. Um `verified-pass` isolado **não promove o conjunto**: a peça só poderá estar totalmente verificada quando todos os modos aplicáveis estiverem cobertos, ações ULS/SLS válidas e hipóteses revisadas. Em caso de ausência, permanece `NOT_VERIFIED` e `approvedForFabrication=false`.

### 3.3 O bloqueio dos cinco pontos amostrados

M23 retorna **cinco estações por segmento**. Uma UDL de pórtico gera esforços internos que variam ao longo do trecho; pontos críticos podem estar **entre** as estações. Antes de usar solicitantes como valores máximos normativos:

1. Validar recuperação dos **esforços de extremidade, cargas uniformes equivalentes por combinação e eixos** contra o Python 3.2.1 real; resolver analiticamente as posições de extremos de `N, Vy, Vz, My, Mz` para cargas uniformes (raízes derivadas, incluindo limites e descontinuidades); **não inventar raízes para outras formas de carga**;
2. Verificar simultaneamente o vetor completo na **mesma posição e combinação** e preservar o ID do trecho/peça; para interação, máximo de cada componente isolado não é máximo da função combinada — avaliar a função e suas possíveis raízes/pontos críticos próprios;
3. Para deslocamentos, usar expressão/recuperação compatível do solver, com busca validada e tolerância; não afirmar extremos contínuos sem método conferido;
4. Separar `sampled`, `continuous-verified`, `unsupported`; não publicar índice de utilização se domínio inválido.

## 4. Referências independentes já localizadas para a família

### CBCA 2014 — manual de dimensionamento de perfis formados a frio

**Fonte editorial original:** Edson Lubas Silva, Igor Pierin e Valdir Pignatta e Silva, *Estruturas compostas por perfis formados a frio*, Instituto Aço Brasil/CBCA, 2014. Identificada no **acervo oficial CBCA**. O manual tem exemplos e o Anexo D de uma edificação. Disponibilidade online de cópia de consulta **não equivale a permissão para reproduzir o livro**.

**Exemplo 04, páginas impressas 51–52:** pilar **Ue 100×50×17×1,2 mm**, **L=4,0 m**, sem travamentos intermediários; consta `Ne=9,57 kN` (modo flexo-torção), `χ≈0,124`, e propriedades listadas (A=2,71 cm², Ix=44,15 cm⁴, Iy=10,12 cm⁴, etc.). Esses valores são **checks intermediários**, não o valor completo final de resistência nem uma aprovação. O material usa NBR 14762:2010 e NBR 6355:2012; o cálculo de distorção pode depender de ferramenta especializada ou hipóteses justificadas.

**Exemplo 05, páginas impressas 53+:** pilar Ue 150×60×20×3,0 mm, **L=6,0 m**, contenção intermediária no eixo de menor inércia; ótimo teste de tratamento distinto de `Lx`, `Ly`, `Lt` após a implantação do modo apropriado.

**Acervo oficial:** https://www.cbca-acobrasil.org.br/site/biblioteca/?bsc=ativar&bscPgn=2&bscQtdReg=10&chkCat%5B%5D=7&txtBscKeyword=

### Artigo de pesquisa 2021 — PFF-NBR14762 x mCalc_Perfis (benchmark adversarial)

**Fonte:** Sasso, Ramires e Pravia (Universidade de Passo Fundo), *PFF-NBR14762: um aplicativo para o dimensionamento de perfis formados a frio*, **Revista de Ensino de Engenharia**, v.40, p.3–14, 2021, DOI **10.37702/REE2236-0158.v40p3-14.2021**. Link editorial: https://revista.abenge.org.br/index.php/abenge/article/download/1807/1012/3472

- Seção de resultados: compara programa educacional com `mCalc_Perfis`, usando seções conforme NBR 6355:2012. O artigo declara **fy=30 kN/cm², E=200 GPa, ν=0,3 e Cb=1,0** nos ensaios comparativos; deve-se conferir cada linha e dado geométrico.
- **Tabela 5, página impressa 10:** Ue **150×60×20×2,65 mm**, `Lx=Ly=Lz=300 cm`, compressão: **60,90 kN vs 59,66 kN** (aproximadamente 2,04% de diferença entre programas).
- **Tabela 6, página impressa 10:** mesma seção, cisalhamento: **60,45 kN vs 60,45 kN** (igualdade reportada).
- **Tabela 7, página impressa 11:** mesma seção, flexão: **607,38 vs 601,12** na unidade **impressa** `kN.m` — **ALERTA**: existe risco de erro de legenda/unidade (tela da ferramenta no artigo menciona `kN.cm`); **QUARENTENA** até conciliar o valor dimensional e confirmar se representa `kN·cm`, `kN·m` ou outra unidade; não inserir em teste de resistência JPN antes disso.
- **Tabela 7, página impressa 10:** Ue 75×40×15×1,50 mm, L=100 cm, flexão 134,03 vs 167,48 na unidade impressa — diferença declarada ~24,96%. **Não escolher um dos programas como gabarito**.
- Os autores atribuem diferenças a métodos distintos de cálculo das propriedades geométricas das seções (NBR 6355 versus método linear do mCalc). Na auditoria devem comparar **propriedades de seção** antes de resistência.
- Uma tabela isolada de artigo científico **não substitui o texto integral da norma**, tampouco valida uma equação implementada.

**Manifesto curto de casos rastreáveis:** `docs/validation/normative/reference-candidates.json`. Os resultados ainda são candidatos de referência, não *goldens*.

## 5. Plano de ataque para o Codex — duas entregas, não um monólito

### Etapa 1 — integração + precondições verificáveis

- Integrar M25 e PR #32 à cadeia M22–M24, **com CI completa**, resolvendo os conflitos Vercel/roadmap. Não alterar main/deploy.
- Ampliar contratos físicos sem quebrar backups: geometria da seção, propriedades adicionais, regime de contenções, furos **estruturados**, referências normativas e escopo de validade.
- Implementar localização **validada** dos extremos contínuos dos casos suportados. Verificar propriedades e sinais com test vectors independentes.
- Gerar relatório técnico de **cobertura normativa** por peça e ligação, ainda `NOT_VERIFIED` por padrão; nunca marcar aprovação porque os campos foram preenchidos.

### Etapa 2 — primeiro procedimento resistente comprovado

- Obter, por via legítima, a norma integral aplicável, erratas e pelo menos dois exemplos independentes que cubram as hipóteses. O responsável técnico confirma a fonte.
- Selecionar **um escopo fechado** de Ue e estado-limite que possa ser implementado integralmente e testado (por exemplo, tração de peça com tipo de ligação e furação totalmente definidos); todas as demais verificações seguem pendentes. Se a família completa for viável e fundamentada, progredir sem diluir rigor.
- Cada subverificação tem requisitos de dados, fórmula/edição/cláusula efetivamente consultada, unidades, intermediários, seção/localização/combinação que governa, domínio de aplicabilidade, motivo de bloqueio e testes independentes, incluindo caso que reprova, caso que passa e limites.
- **Nunca** confundir um único modo resistente validado com aprovação da **peça inteira**; não derivar fabricação de verificações isoladas.

## 6. Gate de qualidade e definição de pronto

Um relatório de resistência é minimamente auditável quando preserva:

`projeto/revisão/assinaturas` → `ações/casos/combinações com edição normativa` → `membro/segmento/estação crítica contínua ou método justificado` → `N,Vy,Vz,T,My,Mz concomitantes` → `perfil físico/propriedades/contenções/restrições` → `procedimento/cláusula/fatores/limites` → `resistência/interação` → `evidência independente` → `pendências e responsabilidade técnica`.

Critérios para integração: regressão real PyNite, campanha de 1.000 modelos existentes, unitários TS, Playwright 375/1440, PDF/XLSX/DXF, migração/backup e testes de mudança de revisão; preservar limites de execução, autenticação e proibição de fabricação. **CI verde valida o software executado, mas não demonstra conformidade da engenharia**.

**Decisão:** antes de gastar ciclos construindo mais UX ou CAD, fechar integração, obter referências legítimas e validar uma trilha resistente Ue. Depois seguir para a campanha de obras reais do PR #32, com incompatibilidades de edições separadas.
