# M43-P1 — Benchmark independente de segunda ordem e escopo real do solver

**Estado:** PR draft; CI completa e revisão de engenharia pendentes. **NÃO ativa segunda ordem em projetos JPN.**

## Base integrada existente
O motor misto `jpn.mixed3d/1` e `jpn.mixed3d/2` usa `PyNiteFEA==3.2.1` com `analyze_linear`. A solução resultante inclui deslocamentos e reações de primeira ordem, não uma matriz de rigidez geométrica global validada. A existência de um resultado convergido ou de pequenas deformações **não substitui** a verificação de estabilidade da estrutura ou das ligações.

O módulo `second-order-readiness.ts` recebe a mesma requisição/resposta reais conferidas no relatório de resistência e retorna, por combinação:
- maior deslocamento nodal vetorial XYZ (m), nó correspondente e razão em relação ao maior vão global envolvente, apenas para **observação**
- classificação da topologia `frame-only`, `axial-only` ou `mixed-frame-axial`
- residual de equilíbrio da análise **linear**, sem promovê-lo a selo de estabilidade
- lista de pendências de segunda ordem, flambagem, imperfeições, rigidezes e comprimento efetivo dos elementos
- distinção explícita de barras axiais modeladas como `Spring3D`, cuja contribuição de rigidez geométrica Kg não foi validada na análise integrada

O relatório de resistência passa a conter `secondOrderAudit`; qualquer revisão de geometria/resultados recalcula o relatório e invalida seu hash anterior. Os campos `pDeltaExecuted=false`, `pSmallDeltaExecuted=false`, `bucklingModesCalculated=false` e `normativeStabilityVerified=false` são invariáveis nesta fase.

## Referência analítica independente: cantilever prismaticamente comprimido

O ensaio isolado em `engine/tests/test_m43_pdelta_reference.py` constrói no próprio PyNite um pilar em balanço com base engastada, topo livre, comprimento **L=4 m**, área **A=0,02 m²**, módulo **E=200 GPa**, inércia **I=2×10⁻⁵ m⁴**, carga horizontal **H=2000 N** e força de compressão de topo **P**.

Para esse **único** subdomínio idealizado, a carga crítica elástica exata de Euler é

`Pcr = π² E I / (4 L²)` (fator efetivo **K=2 somente neste caso**).

Com `k=√(P/(EI))`, a flecha no topo, sob H, é:

`δ_linear = H L³ / (3EI)`

`δ_segunda_ordem = (H/P) × [tan(kL)/k − L]` para `0<P<0,8Pcr`.

O teste compara `FEModel3D.analyze_PDelta()` (modelo com quatro membros explícitos, sem barras fantasmas) à equação independente em `P/Pcr = 0,05; 0,20; 0,40` com tolerância **1,5%**, e à primeira ordem `analyze_linear()` com 0,005%. Também testa `P=0` e recusa analiticamente o domínio próximo à carga crítica ou entrada inválida.

Um teste separado usa a **rota atual de produção** `analyze_mixed3d` para o mesmo pilar e comprova que ela ainda entrega a solução linear, e **não** se apropria silenciosamente do resultado P-Δ do benchmark.

## O que o benchmark não valida

- Não há segundo-ordem disponível ainda na API de produção; nem valor P-Δ extrapolado do ensaio.
- A fórmula cantilever com K=2 não é fórmula universal para galpão ou telhado sobre parede existente. Geometria, ancoragens, contenções, vínculos e rigidez lateral devem ser declarados/avaliados.
- `Spring3D` de membros puramente axiais representa EA/L bilateral; a rigidez geométrica desses elementos ainda não está implementada/validada no caminho misto.
- Efeitos P-δ internos podem exigir discretização explícita; o número de nós precisa ter critério físico e convergência de malha, não um padrão arbitrário.
- Ainda faltam estudo de auto-valores/mecanismos globais, imperfeições, redução de rigidez, múltiplas combinações, modelos irregulares, ações normativas e referências cruzadas independentes de Frame3DD/OpenSees.
- PyNite com `analyze_PDelta` oferece uma capacidade numérica útil, mas **não constitui, sozinho, comprovação da norma aplicável**.

## Próxima entrega (M43-P2)

Criar contrato versionado separado para a **análise de segunda ordem restrita e revisável**. Só introduzir um caminho produtivo depois de conferir: frame-only com compressão e cisalhamento, análise de sensibilidade com subdivisões 1/2/4/8, fronteira de convergência e instabilidade, verificação das seis reações e momentos, revisão de imperfeições/rigidezes e garantia de falha fechada. A topologia mista com barras axiais continua bloqueada até um Kg físico independente.

**Saída de segurança invariável:** `computedStructuralApproval=false`, `fabricationRelease=false`, `releaseGate=NOT_READY_BLOCKED`. Nenhuma cotação de corte/perfil pode usar esta referência como dimensionamento homologado.
