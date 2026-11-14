# M43-P8 — cancelamento na orientação local e equilíbrio do braço excêntrico

O núcleo P7 formava os quatérnios locais com produtos que incluíam duas
vezes o quadro inicial da seção. Nas barras verticais, a reconstrução do
eixo longitudinal e o cancelamento de termos de ordem unitária introduziam
ruído na rotação relativa. No braço refinado, o resíduo em Fx oscilava
mesmo depois de satisfazer o critério algébrico global de Newton.

O núcleo agora gira o eixo longitudinal a partir da corda de referência.
Se R é o giro corrotacional global e B o quadro de referência, a rotação
local de extremidade é B⁻¹(R⁻¹Qi)B. Calculamos R⁻¹Qi antes da mudança de
base. A conjugação por B preserva a parte escalar e gira apenas a parte
vetorial. A mesma expressão alimenta os jets de energia, força e Hessiana
nos caminhos Python e Numba. Energia constitutiva, apoios, propriedades,
critérios de equilíbrio e limites de Newton permanecem os históricos.

| Caso | Malhas por barra | Resultado local com limites P5 |
|---|---|---|
| Coluna biaxial | 8 | Passa a comparação com a referência qualificada. |
| Pórtico | 4 / 8 | Falha 4, passa 8. Diferença pareada 9,90e-7, abaixo de 1e-4. |
| Quadro espacial | 4 / 8 / 16 | Falha 4, passa 8 e 16. Mudança 8/16 de 1,46e-7 e erro máximo de deslocamento 4,60e-12 m na 16. |
| Braço excêntrico | 8 / 16 / 32 | Equilíbrio e Newton passam. A malha 32, antes recusada após 30 iterações, fecha em 3 na etapa final, com resíduo relativo máximo 9,05e-15. Mudança 16/32 de 5,77e-9. |

A referência qualificada P6 combina contínuo independente, OpenSees 3.8.0
refinado e incerteza numérica. A campanha também roda o OpenSees nativo.
No braço, a diferença bruta máxima de deslocamento frente à malha nativa
64 é 2,96e-9 m. O próprio nativo 64 viola o equilíbrio em Fx
(7,02e-7 N; limite 1e-8 N nesse eixo), portanto a qualificação conjunta
continua recusada. Isoladamente, o contínuo reproduz o braço com diferenças
máximas de 9,33e-14 m em deslocamento, 1,63e-7 N/N·m nas componentes
dos esforços de extremidade e 1,64e-11 J na energia. A malha candidata 64
continua recusada pelo limite de condicionamento. Os resultados finos
são evidência da campanha experimental e não alteram o contrato histórico
de malhas, o bloqueio do braço ou os limites produtivos.

Reprodução com Python 3.12, dependências P7 e o lock OpenSees P2 em venv
separado. Defina OPENBLAS_NUM_THREADS=OMP_NUM_THREADS=MKL_NUM_THREADS=1.

    python validation/m43-p7/benchmark.py --warm-cache-only
    python -m pytest -q experiments/m43_p6 experiments/m43_p7 engine/tests/test_p4_mechanics.py
    python validation/m43-p7/p8_consistency.py --opensees-python <python do OpenSees>

Os JSON brutos e o resumo ficam em .tools/m43-p8/campaign. Integração
futura requer validar a passagem do modelo físico, ações e combinações
para o solver espacial, casos mistos, condições de apoio/ligação, cargas
distribuídas e a recuperação rastreável de esforços e reações sob
instabilidade. A rota produtiva segue linear. `computedStructuralApproval=false`,
`fabricationRelease=false` e `NOT_READY_BLOCKED`.
