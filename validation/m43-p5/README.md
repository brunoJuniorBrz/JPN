# M43-P5 — campanha física reproduzível

`criteria.json` e a reprodução dos quatro casos da P4 foram congelados no
commit `34c24bd`, antes das alterações da campanha. A base é o HEAD do PR #82,
`3f7569cea3d8766f2329148026175d68533915aa`. A ancestralidade #75 → #80 → #81 → #82
foi conferida por `git merge-base --is-ancestor`. As duas execuções da CI dessa
base, `43062549392` e `43062843760`, estavam concluídas com sucesso.

## Reprodução

Com Python 3.12 e os ambientes travados pelos arquivos já existentes:

```text
python -m pip install -r engine/requirements-validation.lock
python -m pip install --no-build-isolation --no-deps -e ./engine
python -m venv .tools/opensees
.tools/opensees/bin/python -m pip install --require-hashes -r validation/m43-p2/requirements-opensees.lock
python validation/m43-p5/reproduce.py --opensees-python .tools/opensees/bin/python --output .tools/m43-p5-evidence.json
```

No Windows, o executável independente fica em `.tools/opensees/Scripts/python.exe`.
Fixar `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1` e `MKL_NUM_THREADS=1`.
A CI executa a campanha nos dois sistemas. Os arquivos detalhados de trabalho
ficam em `.tools/m43-p5-campaign/`, sem bibliotecas ou binários publicados.

## O que foi corrigido na comparação

O JPN retorna `Q = Exp(r)`, com `r` total. O OpenSees acumula DOFs aditivos,
mas atualiza a orientação física com `Q[k+1] = Exp(Δr[k]) Q[k]` em cada iteração.
Usar apenas incrementos dos passos **convergidos** também perderia os produtos
não comutativos das correções de Newton.

`opensees_orientations.py` captura o trace nativo com 17 algarismos, confere a
permutação RCM, a quantidade de iterações e a soma de TODOS os incrementos contra
`nodeDisp`. A composição produz matrizes físicas, comparadas por
`||Log(Qjpn Qrefᵀ)||`, com os erros dos três diretores também registrados.
A distância usa `atan2`, evitando a perda de precisão de `acos` perto de zero.
A auditoria TypeScript implementa a comparação independentemente.

Fonte primária examinada: [OpenSees 3.8.0, CorotCrdTransf3d::update,
quaternionProduct e getQuaternionFromPseudoRotVector](https://github.com/OpenSees/OpenSees/blob/v3.8.0/SRC/coordTransformation/CorotCrdTransf3d.cpp).
SHA-256 dos bytes examinados:
`793ddee86cfc30543af508530ef739727bfa8cae4879f8a007e69d30320c1e44`.
O produto nativo inverte o sinal do produto vetorial em relação à ordem usual;
por isso sua chamada aparente não significa composição à direita.
Nenhum código-fonte ou binário do OpenSees foi incorporado ao motor JPN.

## Referências, discretização e incerteza

Uma única malha OpenSees não representa a solução contínua. A campanha executa
três malhas reais, sem ultrapassar 150 nós/320 barras nem na referência:
coluna 16/32/64, pórtico 8/16/32, quadro 4/8/16 e braço 8/16/32 subdivisões
por barra física. Guarda todos os valores originais e os resíduos das seis
resultantes na geometria deformada.

O braço com 32 subdivisões apresenta resíduo nativo `Fx=-3,386e-8 N`
num componente sem carga em X e falha no equilíbrio relativo `1e-8`.
Essa falha da própria referência é retida; não se zeram componentes nem se
relaxa o critério. A coluna aprovada exige também equilíbrio das três referências.

Para grandezas vetoriais, `e = (4u[2n]-u[n])/3`; a diferença entre duas
estimativas consecutivas, dividida por 15, mede o resto de ordem quatro.
Para SO(3), a correção é aplicada no espaço tangente, por composição exponencial.
Isso é uma **estimativa assintótica condicionada a erro suave de ordem dois**,
não um limite de erro certificado ou uma equivalência exata entre operadores.
Todos os erros de referência entram somados ao erro observado na aceitação.

As duas cadeias sem ramificações também possuem uma referência contínua própria,
implementada separadamente, sem importar JPN, PyNite, sua energia ou seu AD:

```text
d1 = R e1; n = F·d1; m = Rᵀ M
r' = (1 + n/EA) d1
R' = R skew(m1/GJ, m2/EIy, m3/EIz)
F' = 0; M' = -r' × F
U' = 1/2 [n²/EA + m1²/GJ + m2²/EIy + m3²/EIz]
```

São equações de equilíbrio e curvatura material de uma barra extensível sem
cisalhamento. Uma integração DOP853 e shooting do momento inicial impõem
engaste declarado e momento terminal nulo; forças pontuais e o cotovelo físico
continuam explícitos. Duas precisões de integração verificam o erro numérico.
Soluções analíticas de extensão/torção e arco circular verificam esse integrador.
Este oráculo privado recusa pórticos, ramificações, cargas desconhecidas e
momentos aplicados. Não é uma capacidade adicional do aplicativo.

## Aceitação e evidências

Para cada componente, `|a-b| + incerteza <= atol + 1e-7 max(|a|,|b|)`.
Para orientação física, a mesma regra angular usa as magnitudes das rotações
totais compatíveis; os diretores permanecem no relatório. Os pisos dimensionais
estão no contrato congelado. Equilíbrio `1e-8` e refinamento `1e-4` são mantidos.

`evidence.json` contém entradas vinculadas, números antes/depois, componentes
governantes, referências, orientações, forças, momentos, energia, Newton,
estabilidade e rejeições. `cantilever-audited-result.json` permite repetir a
auditoria TypeScript completa da energia e dos esforços do resultado aceito.
Os cinco fontes Python/TS centrais da P4 são conferidos por hash a cada execução.

Uma CI verde exige a comparação estrita da coluna, preservação das regressões
anteriores e ausência de deterioração da baseline. **Não significa quatro
casos aprovados**: resultados falhos continuam explícitos, com liberação
produtiva/normativa/fabricação bloqueada. O estudo não altera a energia, os
contratos `/1`, `/2`, `/3`, limites, apoios ou propriedades para obter aprovação.
