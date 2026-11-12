# M51 — primeira referência de flambagem lateral com torção

PR #87 revisado e integrado com histórico em `4301ab20fdb02898a9d0a03d25d8ab23d39321c4`.
HEAD M50 `7a5431f` tinha CI push/PR 11/11. Nenhum deploy. Acompanhamento da
[CI da main](https://github.com/brunoJuniorBrz/JPN/actions/runs/43279287664).

## Domínio executado

`spatialPreparation.elasticLtbStudies` é opcional, explícito e limitado a quatro
peças/combinações. `/api/experimental/structural-assessment` reutiliza adaptador,
solver Python, ações locais nativas, recuperação contínua, análise de seção e
relatório resistentes existentes. Não há novo solver, interface ou dado ABNT.

Caso admitido: viga reta, prismática, isolada, perfil I laminado/soldado
duplamente simétrico; flexão forte local y por binários puros nos extremos,
momento constante, carga na referência do centro de cisalhamento, altura zero.
Uma peça original inteira, um segmento; nenhuma redução implícita de Lb.
Garfo nos dois extremos: UY/UZ/RX fixos, RY/RZ livres; UX fixo só no início.
Seis contenções físicas vinculadas aos DOFs/interfaces realmente declarados.
Empenamento livre em cada extremo exige declaração própria, fonte e responsável;
o solver de seis DOFs não verifica essa condição física.

Até integrar/revisar a C1, somente barra no sentido global +X, giro zero e matriz
nativa identidade são admitidos. **Nenhum arquivo Python do motor nem módulo de
eixos/recuperação de esforços foi alterado.** Não se infere contenção de telhas,
terças ou paredes. Rigidez finita/intermediária, vigas contínuas/segmentadas,
excentricidade, cisalhamento, torção, axial, flexão fraca, momento não uniforme e
empenamento restrito/desconhecido ficam bloqueados neste procedimento.

`sectionproperties 3.10.2` calcula A, Iy, Iz, J e Iw a partir da geometria I atual,
com refinamento observado em 0,001, sem substituir propriedades manualmente.
Propriedades FE/resistentes devem corresponder ao cálculo dentro da resolução
de seis algarismos já adotada no projeto. Uma resolução arbitrariamente alargada
não permite admitir outra seção. Iw não é inventado pelo catálogo ou pela UI.

## Referência e verificação independente

[Rui Simões, *Design of Members*, workshop JRC, 16–17/10/2014, PDF p.22](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/05_Eurocodes_Steel_Workshop_SIMOES.pdf):
caso padrão de momento uniforme, seção duplamente simétrica, garfos e empenamento livre.
SHA256 do PDF consultado: `19cc08d16806b55b29ba9755f3a8b431d7dd1b9027682e4af7172551babca2a3`.
Somente referência e equação clássica; PDF não redistribuído.

Em SI, `k=pi/L`, `Mcr=k sqrt(E Iweak (GJ + EIw k²))`.
Adotando `v=V sin(kx)` e `phi=Phi sin(kx)`, a matriz da segunda variação de energia
é proporcional a `[[EIweak k⁴, -M k²],[-M k², GJ k²+EIw k⁴]]`.
Determinante zero fornece a bifurcação; não fornece resistência de cálculo.

`reproduce.py` monta operador independente por diferenças centrais e resolve o
autovalor com SciPy, sem importar a função de produção. Seis casos, três malhas
(16/32/64 nós interiores), convergência por baixo. O limite de erro da discretização
é fixado a priori por `pi²/[12(n+1)²]`, derivado de `sin(x)/x`; erro de arredondamento
é separado por norma do operador e epsilon da máquina. Resíduo do autovetor é
conferido. Isso não relaxa qualquer tolerância ou referência preexistente.
Com `--evidence`, também confere os três resultados integrados contra a referência
independente, hashes da análise e bloqueios estruturais.

Fixture sintética: I 200x100x6x10 mm, r=0, L=6 m, E=200 GPa, G=200/2,6 GPa,
fy=250 MPa, binários de 10 kNm, 30 kNm e sentido inverso. Momento, flecha
`|M|L²/(8EIforte)`, equilíbrio de forças/momentos, inversão de sinal e caso acima
do crítico são comparados independentemente. O caso com altura 0,1 m fica bloqueado.
Casos inválidos incluem eixos C1 não suportados, diagrama não uniforme,
empenamento desconhecido, contenção ausente, Lb artificial e dados obsoletos.

## Estados e segurança

Mcr é bifurcação elástica de peça ideal. O resultado abaixo de Mcr é
`BELOW_ELASTIC_CRITICAL_CONDITIONAL`; acima é `ELASTIC_INSTABILITY_INDICATED`.
Se `fy W` precede Mcr, retorna `YIELD_PRECEDES_ELASTIC_BIFURCATION`.
Não se usa `min(My,Mcr)` como MRd. O relatório resistente incorpora a evidência
na peça/combinação e preserva suas verificações normativas pendentes.
`designResistance=null`, `normativeResistanceVerified=false`,
`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.
Sucesso do solver linear acima de Mcr não demonstra estabilidade.

Permanecem: classificação/local/distorcional, imperfeições, tensões residuais,
curvas/reduções normativas comprovadas, capacidade de contenções/ligações/existente,
carga excêntrica, momento variável, rigidez finita, continuidade e segunda ordem.
M43/M44/M45 não estão concluídos. Próxima prioridade: integrar a C1 e validar
diagrama variável/altura de carga e contenções elásticas com referência independente.

## Reprodução

```sh
pnpm exec vitest run src/domain/elastic-ltb.test.ts
python validation/m51/reproduce.py
python validation/m51/reproduce.py --evidence .tools/m51-runtime/assessment.json
python validation/m51/capped_section.py
pnpm exec playwright test tests/e2e/m51-ltb.spec.ts
```

Usar perfis Python já fixados no projeto; execução Next→Python somente com
executor local configurado. CI final executa suíte integral, referências por OS,
worker I sob 20 s/768 MiB no Linux/Windows, HTTP real, exportações e build.
Evidências ficam nos artefatos `.tools/m51-runtime/` e `engine/validation-results/`.
No PC local, o primeiro perfil recusou por memória e o perfil isolado atingiu
20 s ao calcular seção. As proteções foram preservadas; esses resultados não
são contados como validação aprovada da cadeia local.
