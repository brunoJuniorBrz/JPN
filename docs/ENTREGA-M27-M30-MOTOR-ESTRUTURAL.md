# Entrega M27–M30 — incremento matemático funcional, gate bloqueado

Base técnica: PR #35 `51273a29f89fe5c366d837411d8f452d4c7a7547`.
Base da branch: PR #36 `b05c7fb9d04ad522b2795e58e4f6a9989124ea95`.
Branch: `feat/m27-m30-structural-engine-complete`.
PR draft contra `docs/m27-m30-engine-release-gate`. Sem merge ou deploy.

**NÃO PRONTO — BLOQUEADO para o motor de dimensionamento completo pedido na
missão.** Há código executável e verificações novas, não conformidade ABNT.
O esclarecimento posterior do usuário autorizou prosseguir com fontes públicas
sem substituir resistência normativa por autovalores elásticos.

## Implementação entregue

**M27:** corrigidos diagnósticos M26 de cobertura e família. Propriedades físicas
e propriedades do solver são comparadas por guarda de ponto flutuante e metade
da resolução explicitamente declarada, na mesma unidade. Nenhuma tolerância
percentual de diferença resistente foi criada; a precisão não é inferida de JSON.
I/W tem avaliador próprio; não recebe rejeição por não ser Ue.

sectionproperties 3.10.2 executa em Python 3.12 real, com área, inércias, J, Iw,
centroide, centro de cisalhamento e módulos elásticos para geometria física
Ue/I. São três malhas, com refinamento e proveniência exportáveis na interface.
Não altera silenciosamente A/I/J da análise. O contrato separado é
`jpn.section-analysis/1`. Não calcula propriedades efetivas nem resistência.

pyCUFSM 0.2.0 foi ligado ao mesmo worker opcional local por
`jpn.elastic-strip/1`, em ambiente isolado compatível. O núcleo principal mantém
NumPy 2.5.4/SciPy 1.18.1/PyNiteFEA 3.2.1. A incompatibilidade de conversão
escalar do pyCUFSM com NumPy 2.5 foi reproduzida; não houve monkeypatch ou
downgrade do motor. A licença instalada é AFL-3.0, distinta da LGPL-3.0 do HEAD
GitHub consultado. Dados do CUFSM original são MIT e têm commit/SHA registrados.

**M28:** recuperada flecha XYZ relativa à corda dos extremos da **peça original**,
abrangendo todos os segmentos. Polinômios de deslocamento são transformados por
R transposta; a corda é subtraída antes de localizar extremos das componentes
e da norma vetorial. Esta última usa raízes da derivada do quadrado da norma,
até grau sete, sem depender de grade de cinco pontos. Cortes mantêm ambas as
faces e seis esforços concomitantes. Elementos axiais/v1 e peças não retas não
recebem esse campo por aproximação. Critérios SLS explicitamente declarados
produzem atende/excede/bloqueado e razão demanda/limite **declarado**, nunca
utilização normativa. Cadastrar/revisar invalida o resultado anterior.

P-Delta nativo foi auditado contra viga-coluna analítica, mas não habilitado no
modelo misto: `Spring3D` não fornece termos Kg. Vento/fatores e combinações
anteriores foram preservados; não foram convertidos em valores normativos.

**M29:** chapa retangular e furos circulares passam por conferência de passo,
distâncias aos bordos, colisão, contenção no retângulo e seção de corte explícita.
Área líquida digitada não basta para conferir a geometria. No exemplo sintético
100 × 200 × 5 mm, dois furos de 10 mm no corte resultam em A bruta transversal
500 mm² e A líquida do corte 400 mm². Isso não verifica o caminho governante ou
capacidade da ligação. O cadastro recusa novas geometrias comprovadamente
inválidas; relatórios mostram defeitos de declarações antigas sem destruir backup.
O editor preserva a associação explícita de cada furo à sua chapa.

**M30:** controles mínimos nas telas existentes de resistência/ligações, exportação
do cálculo de seção e gate calculado/exportado. Relatórios derivados evoluem para
`jpn.continuous-demands/2` e `jpn.resistance-report/2`; contratos dos solvers
anteriores permanecem iguais. A API de seção é somente local, origem estrita,
JSON estrito no Python, `-I`, 768 MiB, 20 s, 500 kB/2 MB e exclusão compartilhada
com o processo misto. Nenhuma autenticação ou matemática anterior foi alterada.

## Referências independentes e resultados

| Ensaio | Referência independente | Evidência |
|---|---|---|
| Retângulo 20 × 40 mm | A=800 mm², Iy=bh³/12, Iz=hb³/12; série de Saint-Venant para J | `section-comparisons.json`; diferenças de A/I da ordem de 1e-10 ou menores; J numérico difere 16,236 mm⁴ da série, dentro do alvo de refinamento deste ensaio |
| I 200 × 100 × 6 × 10 mm, raio zero | Soma de três retângulos e eixos paralelos | A=3.080 mm²; deltas das inércias registrados; escala J∝s⁴ e Iw∝s⁶ testada |
| Ue arredondado sintético | Retas mais quatro quartos anulares, com déficit exato da aproximação poligonal | Diferença de A frente à referência poligonal ~1e-12 mm²; não afirma equivalência exata com arco circular |
| CUFSM compressão/flexão | 99 pontos de cada arquivo MATLAB original, unidades convertidas in→mm e ksi→MPa | Maiores erros absolutos dos fatores: 5,4194e-7 e 7,9392e-7; critério upstream específico 1e-4, não percentual de resistência |
| Flecha de peça cortada em 1,3 + 2,7 m | Solução polinomial de viga escorada, flexão biaxial, axial e rotação local | Localização crítica analítica, norma XYZ, faces dos cortes, invariância por translação rígida e SHA adulterado testados |
| Critério declarado | Limites sintéticos favorável/desfavorável, mesma resposta física | `meets-declared-limit` e `exceeds-declared-limit`; ausência SLS bloqueia; `normativeVerified=false` |
| Viga-coluna P-Delta | dx=H/P·[tan(kL)/k−L], rz=−H/P·[sec(kL)−1], k²=P/EI | P/Pcr=0,2/0,6/0,85; malhas 8/16/32; convergência de dx/rz e do balanço |
| Geometria de ligação | Distância euclidiana, interseção círculo-retângulo e largura remanescente × t | Passos/bordos/corte/colisão/dimensões incorretos recusados; sem resistência presumida |

A primeira auditoria P-Delta falhou em dois casos ao exigir balanço de momento
no piso 1e-5 N·m da malha grosseira. Para P/Pcr=0,6: residual 1,5466e-4 →
3,9188e-5 → 9,8437e-6 N·m; para 0,85: 7,9233e-4 → 1,9957e-4 → 5,0223e-5.
Os testes agora **registram a falha grosseira e a convergência**, sem relaxar o
gate nem aprovar P-Delta no JPN. Refinamento não é prova normativa de estabilidade.
Iw/centro de cisalhamento não têm aqui validação independente absoluta completa
para toda seção; refinamento e escala não foram anunciados como tal.

Na conversão CUFSM, índices de nós/elementos foram normalizados para base zero,
sem mudar o grafo. Há uma diferença constitutiva rastreada: o arquivo original
fornece E=29.500 ksi, ν=0,3 e G arredondado=11.346,15 ksi; o contrato isotrópico
calcula G=E/[2(1+ν)]=11.346,153846… ksi. Não foi calibrado G para aproximar a
curva. O pequeno arredondamento impede alegar identidade constitutiva exata e
contribui para os deltas registrados; o critério de comparação é o do ensaio
upstream, não uma tolerância universal de engenharia.

## Testes, falhas e limites

A tabela auditável de comandos e saídas finais está em
`validation/engine-release/COMMANDS.md`, com os logs e JUnit correspondentes.
1478 testes Python dos motores anteriores e novos testes de auditoria, mais
1.000 comparações independentes existentes, passaram. Os perfis opcionais têm
quatro testes de seção e quatro de faixa finita, incluindo subprocesso real.
Vitest completo passou 355 testes; três testes adicionados depois passaram de
forma direcionada. A CI executa a suíte final conjunta, sem usar esse somatório
como alegação de uma nova execução completa. TypeScript/lint/build e navegador
têm resultados registrados por comando, não inferidos de mocks.

Falhas de execução também foram preservadas: teste UI inicial com rótulos
corrompidos por codificação ASCII; dois testes de furação que fechavam o `<details>`
aberto; verificador DXF sem artefato após limpeza do Playwright. Corrigidos os
testes de interação/codificação, e regenerado DXF antes da verificação independente.
Essas correções não alteram dimensões, equações ou tolerâncias de engenharia.
Uma tentativa inicial de criar venv com o Python embutido falhou por ausência de
`venv`; o perfil FSM foi instalado em outro intérprete portátil. Ele não contém
pip: suas oito dependências ativas foram verificadas por importlib/packaging.
No Python principal `pip check` passou. A CI usa Python 3.12 normal em ambos OS.

Não foram reproduzidos dois projetos externos completos. A ficha
`validation/engine-release/EXTERNAL-ROOF-GATE.md` distingue fonte incompleta,
acesso recusado e hipótese não reconciliada. Não há modelo inventado para fechar
essa exigência. O gate global permanece bloqueado por resistência/interações,
ações normativas, segunda ordem mista, ligações/fundação e essa campanha externa.

## Desempenho medido

Windows, Python 3.12.10, Node 24.13.0, BLAS/OMP/MKL=1; não são garantias para
qualquer modelo dentro dos limites dimensionais. `benchmark.json` contém dados
brutos e hashes. No worker protegido, cobertura sintética 207 peças/132 nós/243
segmentos/3 combinações: 4,37 s, RSS amostrado 98,83 MB, saída 1.304.091 bytes.
150 nós/320 segmentos/1 combinação: 5,62 s, RSS 102,99 MB, saída 518.452 bytes.
150/320/10: recusado com `OUTPUT_LIMIT` em 8,26 s, RSS 109,29 MB. O limite de 2 MB
foi preservado: esses máximos não garantem execução conjunta de dez combinações.

O benchmark integrado de vento sintético/4 combinações levou 0,118 s no adaptador,
4,370 s no worker e 1,754 s no relatório, total 6,242 s. O relatório tem 13.013.489
bytes e 5.489 posições de flecha. RSS Node antes/depois: 76,5/374,5 MB, **snapshots,
não pico certificado**. É uma limitação importante do relatório completo.
Viewport móvel no Chromium desktop não certifica memória em hardware móvel real.

## Operação pelo Ton no domínio parcial demonstrado

1. Em Python 3.12 convencional, instalar `engine/requirements-sections.lock` no
   ambiente local do JPN; instalar engine editável como já previsto no projeto.
   Executar `pnpm dev:structural`. Não publicar este perfil na Vercel nesta entrega.
2. Abrir/criar projeto. O exemplo de vento zonal é **sintético** e só deve ser
   usado para reproduzir ensaio, nunca para preencher automaticamente uma obra.
3. Declarar/revisar vínculos, materiais e cargas reais no fluxo existente.
   Na preparação resistente cadastrar família e geometria física completa.
4. Depois da análise, escolher a peça. Em **Calcular propriedades físicas da seção
   — Python real**, informar Poisson/responsável e executar. Exportar o cálculo
   com entrada, fonte/revisão, malhas e hash. Valores não são copiados silenciosamente
   para a seção do solver; a compatibilidade deve ser revisada explicitamente.
5. Em **Flecha da peça inteira e limite declarado**, escolher grandeza, combinações
   SLS e limite com fonte/revisão/responsável. Registrar, recalcular e conferir
   demanda, posição, combinação e atende/excede. Isso ainda não homologa ELS.
6. Na ligação, cadastrar chapa física e depois **Conferir chapa e furação por
   coordenadas**: origem, dimensões, eixo, corte e precisão; selecionar chapa e
   peça de cada furo. Corrigir inconsistências antes de registrar/recalcular.
7. Exportar os relatórios existentes. Resultados inválidos/antigos ficam bloqueados.
   Não há nesta entrega comando de aprovação normativa ou de fabricação.

Os controles novos usados nesse fluxo não exigem editar JSON. A análise por
faixas finitas ainda é CLI técnica, não parte do fluxo comum do Ton:

```powershell
# Outro ambiente Python 3.12, separado do solver:
python -m venv .venv-fsm
.venv-fsm/Scripts/python -m pip install -r engine/requirements-fsm.lock
Get-Content engine/examples/elastic-strip-compression-reference.json -Raw |
  .venv-fsm/Scripts/python -I -X utf8 engine/section_worker.py
```

No Linux, usar `.venv-fsm/bin/python`; o mesmo JSON pode entrar por redirecionamento.
O chamador técnico deve manter timeout 20 s e saída 2 MB, como o runner local.
O exemplo contém tensões explicitamente sintéticas/de referência, não resistências.

M25, quantitativos, orçamento e documentos comerciais não foram modificados.
As fontes e limites estão em `ENGINE-SUPPORTED-DOMAIN.md`,
`ENGINE-NORMATIVE-TRACEABILITY.md` e `ENGINE-RELEASE-GATE.md`.
