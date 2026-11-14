# INT-3b — Gate do oráculo de segunda ordem

**Etapa 1 reprovada.** Os critérios e a geometria foram commitados
localmente antes da primeira execução em `ee306bb76c6e310fe05132b855d6f072e223170f`.
O blob de `oracle.py`, `1e2e948d9304b2cdf75f71e49f54d7a55b8f33fa`, foi preservado
no commit publicado. Duas execuções locais produziram o mesmo `oracle.json`.

| Grandeza | Viga biarticulada, primeiro modo | OpenSees 3.8.0, dois elementos corotTruss colineares |
|---|---:|---:|
| Compressão aplicada | 925.275,41 N (75% de Pcr = 1.233.700,55 N) | 925.275,41 N |
| Tangente transversal sem compressão | 1.522.017,05 N/m | 0,00625 N/m na sondagem finita; zero no limite |
| Kg projetado | −1.141.512,79 N/m | −925.703,68 N/m |
| Tangente com compressão | +380.504,26 N/m | −925.703,67 N/m |
| Amplificação física | 4,0 | Indefinida; o ensaio transversal sem compressão foi singular |

Para a viga, usamos a forma `sin(πx/L)` e uma carga transversal senoidal
com força generalizada de 1 N. Essa escolha dá exatamente
`1/(1 − P/Pcr)` no modelo linearizado de viga-coluna. A força de 1 N no
nó central da treliça realiza o mesmo trabalho virtual para um
deslocamento modal unitário no meio. Os projetores de Kg correspondem
aos campos de deslocamento de cada modelo e a comparação não pressupõe
que os campos coincidam. O erro de Kg em relação ao modo de Euler é
18,91% (limite pré-fixado de 1%).

A treliça sem rigidez flexional tem mecanismo transversal no estado reto
sem carga. Sua tangente sob compressão concordou com a própria expressão
`−4P/L_deformado` (erro relativo 9,62e−12 contra limite 1e−6). Sob a força
de +1 N a solução carregada retornou −1,0803 µm, compatível com a tangente
negativa. A convergência do iterador nesse ramo não caracteriza uma
resposta estável. O guia temporário usado para o pré-carregamento foi
retirado antes dessa medição.

O gate solicitado condiciona os dois pórticos à aprovação no caso de
Euler. Portanto os pórticos e as etapas 2 e 3 ficaram pendentes. Para
uma futura campanha, o `corotTruss` pode servir de referência do Kg axial
e da estabilidade global de um sistema contraventado. A flambagem
isolada de Euler exige um elemento com EI e uma referência de
viga-coluna com as articulações declaradas. Aprovar esse desdobramento
exige um novo protocolo de validação.

Reprodução no ambiente OpenSees do lock da CI:

    python -I validation/int-3b/oracle.py

Referência da API [OpenSees corotTruss](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/CorotationalTruss.html).

`computedStructuralApproval=false`, `fabricationRelease=false` e
`NOT_READY_BLOCKED` preservados.
