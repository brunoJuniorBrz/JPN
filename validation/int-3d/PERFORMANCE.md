# INT-3d — desempenho do galpão

A rigidez elástica já era montada uma vez por nível. Agora são
reaproveitadas também sua fatoração e as derivadas do centroide das
cargas distribuídas no estado inicial. O tangente usa Cholesky em banda
após reordenação quando a largura de banda permite. Os autovalores
extremos da matriz escalada continuam controlando estabilidade e
condicionamento. O teste compara todos os valores do resultado do
pórtico rotulado com carga distribuída pelo caminho denso sem cache
e pelo caminho otimizado, com limite absoluto e relativo de 1e−10.

Medições em Windows com BLAS em uma thread:

| Medição | Antes | Depois |
| --- | ---: | ---: |
| Galpão, 42 combinações na primeira malha | 12,87 s | 11,58 s |
| Mediana por combinação na primeira malha | 0,295 s | 0,266 s |
| U-N01 isolada até recusa de malha | 27,51 s | 26,73 s |
| Álgebra linear em U-N01 | 2,77 s | 1,92 s |

Os arquivos `shed-coarse-*.json` registram o tempo de cada uma das
42 combinações na primeira malha. A instrumentação encerra esse ensaio
antes da próxima malha. Os arquivos `shed-controlling-*.json` seguem
U-N01 por todos os níveis que cabem no teto atual. No caminho otimizado,
19,58 s foram gastos nas derivadas do pórtico e 4,01 s nas derivadas das
cargas; juntos, 88% dos 26,73 s. U-N01 não converge com até 384 nós.
Paralelizar combinações preservaria essa recusa.

O worker do galpão completo excede 20 s com a guarda ativa. O teste
continua registrando esse timeout como falha esperada. Os tempos da
primeira malha são perfis diagnósticos, sem publicação de resultado parcial.

    python -I validation/int-3d/profile_shed.py --max-subdivisions 1 --output <arquivo>
    python -I validation/int-3d/profile_shed.py --first-only --output <arquivo>
