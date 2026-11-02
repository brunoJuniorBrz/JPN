# JPN — Campanha de validação com projetos reais e memoriais de referência

**Registro da pesquisa:** 02/11/2026  
**Prioridade:** **ALTA — PRIMEIRA CAMPANHA APÓS A INTEGRAÇÃO DO MOTOR M22–M24 E A IMPLEMENTAÇÃO DAS VERIFICAÇÕES RESISTENTES NORMATIVAS PENDENTES DA M23.**  
**Estado:** fontes públicas identificadas e triagem inicial realizada; **nenhuma comparação JPN × projeto de referência executada**. Não inferir homologação, segurança, conformidade normativa ou autorização de fabricação deste documento.

## 1. Objetivo, início e limitações

Reproduzir no JPN, com hipóteses documentadas, casos de coberturas e galpões de aço para confrontar (a) geometria e quantitativos, (b) ações e combinações, (c) reações/solicitações/deslocamentos do solver, (d) verificações resistentes de perfis, (e) ligações/apoios/estabilidade. Projetos publicados servem como **evidências comparativas**, não como prova automática de correção; erros e inconsistências também podem existir nos memoriais.

**Gatilho para começar:** motor de análise e contratos M22–M24 integrados e auditados; pelo menos uma família de perfis com procedimento resistente completo e verificável; critérios normativos, limitações e fontes do procedimento documentados. A campanha pode começar antes dessa condição **somente** como ensaio explicitamente parcial de geometria/ações/esforços, sem classificação de resistência. A validação normativa atual permanece pendente.

**Condições prévias:** obter fontes legítimas das normas aplicáveis; registrar edição, erratas e escopo; estabelecer responsável pela revisão independente de engenharia; selecionar o subconjunto de cada caso que o JPN realmente suporta. Não modificar silenciosamente modelos para forçar coincidência.

## 2. Referências selecionadas

Os links abaixo são **fontes externas para consulta**, não anexos redistribuídos no repositório. Acesso aberto para leitura não presume autorização para copiar imagens, tabelas ou documentos inteiros. Verificar disponibilidade e direitos quando iniciar a campanha.

### REF-01 — UBS Conselvan, Aripuanã/MT (PRIORIDADE 1; modelo de projeto para construção)

- **Fonte:** [Memória de cálculo de cobertura metálica — projeto executivo UBS Conselvan, rev. 3, 38 folhas](https://www.aripuana.mt.gov.br/public/files/publicacoes/memorial-de-calculo_2c34.pdf) (documento publicado em domínio municipal).
- **Natureza:** projeto executivo com revisão indicada **E — Para Construção**, datada de 19/11/2020; **isso não comprova execução/as-built**.
- **Escopo:** coberturas metálicas de **duas águas** (acesso comum) e **uma água** (resíduos); modelo 3D; mCalc3D para análise, mCalcLIG para conexões, ST_CadEM para desenhos; aço ASTM A36/A572 Gr.50/A570 Gr.36/SAE1020 e E=200 GPa (folhas 3–5).
- **Referências rastreáveis:** folha 8 peso de telha termoacústica declarado **15 kgf/m²** e ação de cobertura **25 kgf/m²**; folhas 8–10 vento; folhas 11–30 verificações de perfis incluindo pilar W250×25,3, W150×13 e **terça C200×60×25×2,65**; folhas 30+ placa de base.
- **ALERTA CRÍTICO DE QUALIDADE DA FONTE:** folha 9 declara **V0=45 m/s, arbitrariamente**; folha 10 traz **V0=33 m/s**, velocidade característica 30,38 m/s, pressão calculada 0,57 kN/m² e pressão **adotada arbitrariamente 0,9 kN/m²**. Esses valores **não formam uma linha de cálculo inequívoca**. Abrir achado e reconstruir a hipótese com fonte normativa antes de usar qualquer resultado de vento como oracle.
- **Testes propostos:** geometria 1/2 águas quando dimensões estiverem suficientemente descritas; unidade e transferência de carga à terça; esforços/solicitações da peça; perfis e tensão/resistência **somente com norma e condições equivalentes**; ações globais e placas de base apenas quando houver definição física suficiente.
- **Riscos:** edições antigas NBR 8800:2008, NBR 6123:1988 e NBR 8681:2003; possíveis desenhos complementares referidos mas não disponíveis; divergência V0. **Não comparar diretamente a aprovação normativa antiga com procedimento atual.**
- **Estado:** fonte localizada; folhas e inconsistência checadas; parâmetros totais/modelo ainda não transcritos para fixtures. **Elegível para piloto parcial com bloqueio de vento até reconciliação.**

### REF-02 — Manual CBCA, Anexo D: galpão de pequeno porte (PRIORIDADE 1; edificação que a fonte afirma construída)

- **Fonte:** Edson Lubas Silva, Igor Pierin e Valdir Pignatta e Silva, *Estruturas compostas por perfis formados a frio*, Instituto Aço Brasil/CBCA, 2014; [PDF de consulta pública hospedado por terceiro](https://www.jodi.com.br/wp-content/uploads/2021/01/Manual-CBCA-Estrutura-composta-por-perfis-formados-a-frio.pdf). [Acervo CBCA](https://www.cbca-acobrasil.org.br/site/biblioteca?bsc=ativar&bscPgn=1&bscQtdReg=10&chkCat%255B%255D=7) para confirmar edição e acesso legítimo.
- **Natureza:** manual técnico; **Anexo D, desde página impressa 115 (PDF por volta da página 117)**. O próprio texto identifica uma **edificação real construída em São Paulo**, com função de refeitório e nível de implantação +5,9 m sobre uma estrutura de concreto; não tratar automaticamente o título "galpão" como um galpão independente apoiado no solo.
- **Conteúdo:** planta/corte, condições materiais, hipóteses, ações, combinações, esforços, verificações de **perfis formados a frio**, terças, montantes, contraventamentos e elementos de ligação. Referencia NBR 14762:2010 e NBR 6355:2012; usou Metálicas 3D e DimPerfil 4.0. O manual avisa que **nem todas as equações da norma foram reproduzidas**.
- **Testes propostos:** selecionar uma ou mais seções U/Ue efetivamente presentes no Anexo D; conferir dimensões/propriedades, solicitações, tensões e resistências nos modos documentados; testar flambagem local/distorcional e interações **apenas** com texto normativo íntegro; conferir ações e ligações sustentadas pelo modelo disponível.
- **Riscos:** geometria apoiada sobre prédio, detalhes de apoio/contorno não equivalentes à cobertura típica do JPN; licenciamento/autoria da publicação; não copiar tabelas/figuras nem PDF ao Git. Se não for possível reproduzir a vinculação, classificar como **benchmark de membro isolado**, e não da estrutura global.
- **Estado:** anexo e natureza real confirmados no texto; entrada JPN e valores de referência ainda não coletados.

### REF-03 — Cobertura industrial do tanque 6PP30, Vitória/ES — UFMG/Vale (PRIORIDADE 2; projeto de referência industrial)

- **Fonte:** Rita de Cássia Meneghin, UFMG, 2015, *Projeto da estrutura de aço de galpão de proteção de tanques de excesso de partículas de minério de ferro*; [PDF do repositório UFMG](https://repositorio.ufmg.br/server/api/core/bitstreams/2af2e061-7256-4ebe-8d94-bf4506b7a6b9/content) e [registro institucional](https://repositorio.ufmg.br/items/bf1915f8-1bca-452e-9000-999ee956be8d).
- **Natureza:** monografia contendo memória de cálculo de **projeto básico industrial real**; o texto não confirma construção/as-built.
- **Conteúdo:** memória incorporada com ~76 páginas: cobertura, cargas, **combinações**, deslocamentos ELS, SAP2000, dimensionamento de elementos, **quadro de cargas, bases e lista de materiais**. A autora contrasta a análise SAP2000 com cálculos manuais/planilhas sob NBR 8800:2008.
- **Âncoras a extrair e identificar:** seção 12, deslocamentos reportados **27 mm na treliça**, **23 mm na viga mestra**, **0,81 mm em coluna** para hipóteses/combinações ali identificadas; não promover esses valores a tolerâncias universais. Inclui comparação de resistências do software e cálculo manual num elemento, com diferença documentada de ~4%.
- **Testes propostos:** esforço/concombinação na tesoura e viga, deslocamentos ELS, reações de apoio, forças de base, quantitativos e modos resistentes dos perfis. Restringir comparações a geometrias, vínculos e casos representáveis no JPN, preservando sinais e unidades.
- **Riscos:** geometria industrial complexa, temperatura e outras ações; SAP2000 pode ter hipóteses que o motor não suporta; NBR 8800 antiga; partes de desenho são imagens. O caso só entra na campanha global quando houver entrada suficiente para reproduzir rigidez e vinculações.
- **Estado:** arquivo e índice verificados; comparadores de deslocamento localizados no texto; extração completa de hipóteses pendente.

### REF-04 — Cobertura de rampa/escada escolar — UFMG 2025 (PRIORIDADE 2; benchmark mais atual para vento/quantitativos)

- **Fonte:** Jirleia Prates Santana, UFMG, 2025, *Projeto estrutural de uma cobertura metálica simples*; [PDF do repositório UFMG](https://repositorio.ufmg.br/server/api/core/bitstreams/25007f75-9ff4-4487-b3ff-eea680120a42/content) e [registro institucional](https://repositorio.ufmg.br/items/51216d50-19e1-4a04-8cea-acc421123cd4).
- **Natureza:** **estudo acadêmico de projeto** para cobertura de acesso escolar; execução física **não comprovada** no material consultado.
- **Dados publicados para parametrização inicial:** cobertura 15,80 × 15,00 m, altura de referência de vento 7,5 m, S2 reportado 0,913; pórticos separados por 4,722 m; apoio entre pilares com vão de 15,04 m e alturas distintas 3,40/6,35 m; terças a 1,58 m; **CP 0,12 kN/m² e SC 0,25 kN/m²** (seções 5.3–5.5).
- **Vento relatado:** esforços/pressões nas direções X e Y (referências 0,50 e 0,69 kN/m², incluindo combinação de sinal distinta); **não converter esses números em coeficientes de pressão de zona sem verificar o modelo original e sua interpretação**. A fonte cita NBR 6123:2023.
- **Perfis e resultados:** vigas/pilares W250×32,7; terças UE150×60×20×2,65; utilização máxima reportada **87,22% para pilar** e **66,99% para viga** (seção 5.8), sem equivalência automática aos critérios do JPN. Quadro de materiais da seção 5.9 informa **6.934,56 kg** de aço para área apresentada como **225 m²**, ou **30,82 kg/m²**; atenção à diferença entre área da figura de dimensionamento e área declarada da lista.
- **Testes propostos:** estudo detalhado dos carregamentos/vento como dados declarados; reconstrução da geometria e apoios (incluindo desnível), reações, deslocamentos e quantitativos; resistência somente após reproduzir exatamente a família de aço, conexões e critérios.
- **Riscos:** geometria topográfica assimétrica e apoios podem estar fora das tipologias automáticas atuais; resultados de utilização dependem do software e do conjunto inteiro de verificações; detalhes em figuras exigem leitura manual.
- **Estado:** entrada e saídas textuais identificadas; benchmark global **condicionado à capacidade de modelar a topografia e apoios reais**.

### REF-05 — Estudo comparativo de galpão, Rio Verde/GO — IF Goiano 2022 (PRIORIDADE 3; alternativas e consumo de aço)

- **Fonte:** Luís Henrique da Silva Araújo, *Estudo de caso: concepção e dimensionamento de estruturas metálicas para um galpão na cidade de Rio Verde – GO*, 2022; [PDF no IF Goiano](https://repositorio.ifgoiano.edu.br/bitstream/prefix/2865/1/TCC_Luis%20Ara%C3%BAjo.pdf).
- **Natureza:** estudo acadêmico que utiliza dados de trabalho anterior e **concebe quatro alternativas estruturais**, não quatro estruturas executadas. Não servir como validação as-built.
- **Dados do galpão de referência:** comprimento 20,95 m, largura 24,00 m, pé-direito 6,00 m; comparações entre galpões de cobertura trapezoidal treliçada e arco, pilares de alma cheia e pilares treliçados (seção 3.2–3.3).
- **Conteúdo:** análises por mCalc3D e CYPE 3D, cargas e escolha de perfis, consumo comparativo de aço e comportamento da estrutura.
- **Testes propostos:** conferir massa, geometria e seleção de perfis apenas para o modelo trapezoidal compatível; alternativas curvas **não suportadas** pelo gerador atual devem ficar expressamente fora da comparação global.
- **Riscos:** diferenças de tipologia, cargas, critérios adotados e condições de contorno; massa original não equivale a lista de peças reproduzida no JPN sem o mesmo projeto.
- **Estado:** fonte acessível, parâmetros gerais confirmados; baixa prioridade para validar resistência de ligação.

## 3. Seleção por objetivo

| Verificação | Fonte preferencial | Fonte secundária | Observação |
| --- | --- | --- | --- |
| Geometria de cobertura e quantitativo | REF-04 | REF-01 e REF-05 | Só sob mesmas medidas e tipologia |
| Vento e transferência de cargas | REF-04 | REF-01 | REF-01 tem contradições; REF-04 cita NBR 6123:2023 |
| Esforços por peça/combinação | REF-03 | REF-01 e REF-05 | Requer mesma rigidez, modelo, vinculações e cargas |
| Deslocamento ELS | REF-03 | REF-04 | Conferir nó, direção, combinação e versão do cálculo |
| Perfis formados a frio / NBR 14762 | REF-02 | REF-01 e REF-04 | Sem fórmula normativa integral, apenas comparação de referência |
| Ligações, ancoragens e base | REF-01 e REF-03 | REF-04 | Conferir hipótese física e todos os modos de falha |
| Comparação de peso/perfis | REF-04 e REF-05 | REF-03 | Não usar como prova isolada de segurança |

## 4. Procedimento reproduzível obrigatório

**Etapa 0 — admissibilidade da fonte.** Para cada comparação criar uma ficha com: arquivo/URL, autor/órgão, data, revisão, natureza (construída / para construção / projeto básico / acadêmica), identificador de folha/figura/tabela, software de origem, edição normativa, eventual inconsistência e status da informação. Se houver conflito de valores, criar achado, nunca escolher silenciosamente.

**Etapa 1 — congelar entradas, antes de olhar saídas.** Transcrever geometria (todos os nós, peças, seção, orientação, inclinação), materiais (E, G, fy, fu, densidade e propriedades geométricas), conectividade, apoios e liberações, cargas por caso (eixos, áreas e unidades), combinações exatas, parâmetros de instabilidade, contenções e hipóteses de telhamento. Marcar cada entrada como `extraída`, `derivada com método`, `declarada pelo engenheiro`, `ausente` ou `não suportada`. **Não ajustar entradas para aproximar os resultados publicados.**

**Etapa 2 — compatibilidade do modelo.** Conferir uma/duas águas, cortes, vãos, nós, treliças, excentricidades, engastes/pinos, solo/estrutura de suporte, ligações e carregamentos. Registrar separadamente: `comparação global equivalente`, `apenas submodelo/membro`, `comparação de princípio físico` ou `incomparável`.

**Etapa 3 — comparar em camadas.** (a) peças/áreas/comprimentos/quantidades; (b) somatórios de cargas e momentos de cada caso; (c) reações e equilíbrio global; (d) esforços concomitantes por **mesma combinação, peça, segmento, estação e convenção de sinais/eixos**; (e) deslocamentos nos **mesmos nós e direções**; (f) resistências/flechas/interações somente com procedimentos, normas, hipóteses e discretização comprovados; (g) ligações e quantitativos apenas para detalhes físicos efetivamente declarados.

**Etapa 4 — diferenças e aceitação.** Para cada escalar comparável registrar `referencia`, `jpn`, `unidade`, `delta_absoluto`, `delta_relativo`, `base_escala`, `tolerancia_aprovada`, `resultado`, `justificativa`. Na proximidade do zero, a comparação relativa isolada é inadequada: adotar tolerância absoluta/escala física. **Não instituir tolerância universal de 1%, 5% ou 10% por conveniência**; escolher conforme tipo de grandeza, método, arredondamento da fonte, independência e revisão de engenheiro. Nenhum resultado "verde" por casar apenas duas massas ou uma flecha.

**Etapa 5 — investigação obrigatória das divergências.** Diagnosticar hipóteses físicas, unidades, eixos, sinais, rigidez das ligações, comprimento efetivo, malha/estações, projeção de áreas, vento, combinações, edição da norma e dados faltantes. Corrigir o JPN somente quando houver defeito demonstrado; caso contrário classificar `diferença justificada` ou `incomparável`. Persistir fixture e teste de regressão do defeito corrigido.

**Etapa 6 — revisão independente.** Responsável técnico revisa entradas, escopo, procedimentos normativos e conclusões. Arquivar relatório de divergência e decisão com commit, versão do solver e identificador de fonte. **Compatibilidade com memoriais públicos não constitui autorização de fabricação, emissão de ART ou homologação do produto.**

## 5. Estrutura dos arquivos futuros (não criar fixtures com valores inventados)

Sugestão: `docs/validation/real-projects/REF-01/CASE.md`, `inputs.json`, `reference-results.json`, `comparison.json` e relatórios de revisão; repetir por caso. Armazenar apenas dados necessários e permitidos, com fonte/folha e proveniência por valor. **Não commitar PDFs completos protegidos por direitos autorais**, screenshots ou arquivos de terceiros sem permissão. Fixtures serão geradas quando o motor estiver integrado e os parâmetros realmente extraídos.

Ficha mínima de comparação:

```json
{
  "case_id": "REF-XX",
  "source": {"url": "URL verificada", "page": "folha/tabela", "revision": "revisão publicada"},
  "model_equivalence": "pending",
  "normative_edition": "a conferir",
  "combination_id": null,
  "member_or_node_id": null,
  "quantity": null,
  "unit": null,
  "reference_value": null,
  "jpn_value": null,
  "difference": null,
  "tolerance_basis": null,
  "review_status": "not_started"
}
```

## 6. Sequência sugerida após concluir o motor

1. **Piloto simples e auditável:** extrair trecho ou peça da REF-01/REF-04, sem parâmetros conflitantes; confrontar cargas, reações e deslocamentos usando dados explicitamente disponíveis.
2. **Perfil formado a frio:** reproduzir um exemplo do Anexo D da REF-02 que disponha de todas as condições, com referência normativa integral acessível; verificar modos aplicáveis.
3. **Modelo industrial mais exigente:** submodelos e combinações da REF-03, depois estruturas inteiras apenas quando representáveis.
4. **Conexões e bases:** casos REF-01/REF-03 com detalhamento suficiente e modos normativos implementados.
5. **Comparação de produtividade e massa:** REF-04/REF-05 sem transformar igualdade de quantitativo em garantia estrutural.
6. **Validação adicional com engenheiro usuário:** ao menos uma obra cuja geometria, memória, ações, apoios, revisões e detalhes reais ele possa conferir integralmente; material público pode omitir informações essenciais.

**Critério de fechamento:** matriz de cobertura por tipologia × carga × família de perfil × ligação × combinação; zero bloqueadores não explicados nos procedimentos declarados suportados; testes automatizados reprodutíveis com fontes e revisões; aprovação explícita de revisão técnica externa ao desenvolvimento. O percentual de testes unitários não substitui esse fechamento.

## 7. Itens de pesquisa pendentes

- Verificar obtenção legítima dos desenhos complementares de REF-01 e do arranjo completo de REF-03 quando necessário.
- Conferir detalhadamente as páginas/figuras de cargas e apoios de cada caso antes de criar um arquivo de entrada.
- Resolver a contradição interna de velocidade/pressão do vento de REF-01.
- Validar a metodologia de comparações históricas (NBR 8800:2008, NBR 6123:1988) contra os procedimentos das **edições vigentes**, sem misturá-las.
- Conferir licenças e permissões de citação/reprodução de imagens/documentos de terceiros.
- Reavaliar tipologias não suportadas, especialmente cobertura curva e topografia assimétrica; não alterar o tipo estrutural apenas para encaixar no gerador.
- Obter laudos, memoriais independentes e dados de fabricação de profissionais autorizados para a campanha de homologação, se os memoriais públicos forem insuficientes.

**Regra final:** esta campanha tem **prioridade após a entrega técnica do motor**, antes de classificar o JPN como ferramenta pronta para dimensionar obras para compra, corte ou execução. A automação do vento por GPS e o redesenho amplo de UX são melhorias posteriores, não substitutos desta validação.
