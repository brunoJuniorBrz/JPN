# Profiling dirigido — etapa inicial

Reprodução: `python validation/m43-p6/profile_spatial.py`.
Dados locais: `profile-spatial-windows.json`. Cada processo mantém 20 s e
768 MiB. Perfis completos e snapshots parciais ficam em `.tools/m43-p6/profiling`.
As durações incluem overhead de cProfile e gravação periódica; não substituem
os tempos de aceitação sem instrumentação. Tempos cumulativos se sobrepõem.

Malha 2: execução instrumentada concluída em 16,06 s, pico de memória
comprometida 152.100.864 bytes. Multiplicações de jets: 379.652 chamadas,
6,785 s cumulativos; curvatura material: 992 chamadas, 6,601 s cumulativos.
Montagem completa: 32 chamadas; busca linear: 30 avaliações.
Malhas 3/4/6/8 atingiram o limite com instrumentação; seus perfis são parciais,
não resultados aprovados nem demonstração de falha da formulação.

O primeiro coletor usava `dump_stats`, que desabilitava o profiler após uma
amostra. Essas medições foram descartadas. A campanha publicada usa
`snapshot_stats` e escrita atômica, preservando a coleta até a parada.

Ainda pendentes: isolar o custo próprio da instrumentação, comparar Linux,
otimizar operações repetidas somente com equivalência demonstrada, ensaio de
quadratura 8/16/32, diagnóstico TORSION por dois caminhos de equilíbrio e teste
C1. Nenhuma otimização do funcional foi aplicada nesta etapa. Os testes
consolidados do Claude passaram previamente: 156 testes P6.

Não interpretar o arquivo como conclusão da missão ou homologação.
Mantidos `computed_structural_approval=false`, `fabrication_release=false` e
`NOT_READY_BLOCKED`. Produção e contratos históricos não foram modificados.
