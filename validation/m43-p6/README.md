# M43-P6 — piloto isolado de consistência espacial

Base `main` 4301ab20fdb02898a9d0a03d25d8ab23d39321c4, ancestral dos PRs
80–83. Não modifica arquivos do motor, C1/C2/M51 ou frontend. Nenhum endpoint.
Fontes P4 são conferidos pelos hashes LF congelados na P5 antes da execução.

Diagnóstico inicial comprovado pela P5:
- sway: refinamento dos esforços 0,00937857 > 1e-4, mesmo com movimentos
  convergindo; não é justificado alterar tolerância ou declarar erro de Newton.
- spatial: tentativa refinada TIMEOUT em 20 s. Isso não prova não convergência.
  A busca linear calcula Hessianas completas descartadas a cada tentativa.
- torsion: critérios de refinamento passam, mas orientações físicas e a
  referência independente continuam divergentes. A referência OpenSees mais
  fina também falha no equilíbrio. Não atribuir uma causa constitutiva sem prova.

Piloto: comprimento de arco da linha central Hermite em três dimensões,
calculado por oito pontos de Gauss; inclinações obtidas dos diretores rotacionados,
e comprimento da corda deformada. Corrige duas aproximações cinemáticas do
alongamento axial P4 (ângulos como inclinações e comprimento inicial no excesso
de arco). A lei de flexão/torção permanece uma aproximação a validar.
Esse funcional é diferenciado em primeira ordem na busca linear e em segunda
ordem na tangente de Newton. Recuperação, SO(3), estabilidade e todos os
critérios históricos permanecem intactos. Saída própria
`jpn.m43-p6-experimental/1`; nenhum contrato histórico é substituído.
Derivadas são comparadas com AD de segunda ordem e diferenças centrais;
equilíbrio físico, conjugação de momentos, movimento rígido finito, extensão,
torção analítica e perda de positividade da tangente são testados.

Campanha: `python validation/m43-p6/reproduce.py`. Usa as referências físicas
OpenSees/SO(3) e Kirchhoff arquivadas na P5, com hashes e incertezas originais;
não afirma novas execuções OpenSees. Não alterar referências para favorecer o
piloto. Resultados completos em `.tools/m43-p6/evidence.json`/artefatos da CI.
O relatório distingue execução, critérios físicos e aprovação (sempre bloqueada).
Falhas/TIMEOUT permanecem explícitos. CI verde desta campanha significa que a
auditoria executou, não que os três benchmarks foram resolvidos.

Reprodução: `python -m pytest experiments/m43_p6 -q`.
Execução isolada: `python -I experiments/m43_p6/worker.py`, entrada P4 no stdin,
supervisionada por processo pai com 20 s. Memória 768 MiB e bytes 500 kB/2 MB.
Não é um novo contrato de produção nem uma reformulação constitutiva validada.

Integração futura exige revisão C1 da matriz global→local real, preservação do
giro físico, comparação por matrizes SO(3), momentos físicos via Jacobiana
esquerda e repetição dos três critérios pendentes. O piloto recusa alteração
dos fontes históricos; atualização da base exige revisão explícita desses hashes.

`computed_structural_approval=false`, `fabrication_release=false`,
`release_gate=NOT_READY_BLOCKED`. Convergência não equivale a segurança.
