# M43-P6 — consolidação matemática e referências adicionais

Continuação no PR #89, branch `research/m43-p6-spatial-consistency`.
A M43-P6 **não está concluída**. Evidência anterior e P5 permanecem congeladas.
Esta entrega mantém o candidato e acrescenta referências fisicamente independentes,
auditoria dimensional, convergência e controles analíticos. Nenhum arquivo de
produção, C1/C2/M51 ou Studio 3D foi alterado.

## Escala e consistência

O oráculo anterior de curvatura era correto em L0=2 m, mas ocultava a conversão
dimensional: a divisão por 2 era 1/L0 e o fator L0/2 na energia valia 1.
Não foi encontrado erro de escala na equação candidata. Agora a matriz R é
construída independentemente, diferenciada por diferenças centrais e integrada
explicitamente como `kappa=vee(skew(R^T R,u))/L0`,
`U=integral(L0 * kappa.D.kappa/2 du)`. Testam-se L0=1/2/6 m, três conjuntos de
EI/GJ, anisotropia, rotações combinadas e três passos de diferenciação.
Gradiente/Hessiana também são conferidos nos três comprimentos.

Passaram objetividade de estados deformados sob rotações globais finitas,
covariância dos quatro vetores de força/momento, reversão dos nós e troca de
eixos com troca correspondente de Iy/Iz. O limite local de 0,05 rad continua
explícito: 0,049 é admitido no controle, 0,051 é recusado. Isso não amplia o
domínio global do solver. O controle de bifurcação do balanço comprimido converge
com malhas 1/2/4 para Euler extensível: `P*(1-P/EA)=pi²EI/(4L0²)`; verifica sinais
da tangente abaixo/acima da carga crítica e ordem observada superior a 3,5.

## Nova referência física SPATIAL

[Metodologia, equações e reprodução](reference_v2/README.md) e
[evidência local detalhada](reference-v2-evidence.json).
O novo problema de contorno Kirchhoff resolve a rede física, sem copiar o
funcional, Hermite ou AD candidatos. Controles analíticos: extensão/torção,
arco circular sob momento puro em 1/2/6 m e covariância anisotrópica.
OpenSees 3.8.0 foi executado novamente com bases explicitamente auditadas e
orientações compostas de todos os incrementos. O binário não oferece
Corotational02; esse fato está registrado, sem simular sua utilização.

As referências adicionais usam refinamento 4/8/16/32/64 OpenSees e quatro níveis
de colocação, com reinício e tolerância algébrica distintos. Em Windows, a
qualificação numérica condicional passou para cantilever, SWAY e SPATIAL.
Em SPATIAL todos os níveis satisfizeram equilíbrio. A incerteza adotada máxima
consome 8,76% do orçamento de translação e 21,87% do orçamento de esforços,
incluindo desacordo entre formulações. Não é uma estimativa certificada.

Origem da insuficiência histórica: a energia nativa bruta converge com ordem
dois. A extrapolação histórica 4/8/16 ainda retém termo de ordem quatro:
`31,86910531858415 J`, contra `31,86910895496402 J` no contínuo refinado.
Diferença `3,63638e-6 J`, coerente com a incerteza histórica `3,626e-6 J`.
Em T2/X, contínuo `0,00115212120469538 m` e referência P5
`0,0011521195955543 m`, diferença `1,60914e-9 m`, próxima da incerteza P5
`1,60622e-9 m`. Não é evidência de erro de hash ou de eixos. O termo residual
de discretização da referência explica seu orçamento insuficiente; não deve
ser removido nem reduzido retroativamente.

Com a referência adicional qualificada, o candidato SPATIAL nas malhas 2/3/4
mostra erro máximo de translação `1,47606e-8 / 3,32200e-9 / 1,09651e-9 m`;
ordens observadas 3,68/3,85. Na malha 4, utilizações máximas dos critérios:
translação 5,18, esforços 3,00, momento de reação 1,16 e energia 1,11.
Portanto a insuficiência do oráculo histórico não era a única pendência.
Malhas 6/8 excederam 20 s neste Windows e continuam registradas como TIMEOUT.
Não há extrapolação do candidato nem conclusão para as malhas não executadas.

## SWAY: sequência integral

Malhas candidatas brutas 2/3/4/6/8, mesma estrutura e leis, contra a referência
adicional: erro máximo de translação `3,41000e-9 / 7,70423e-10 / 2,55249e-10 /
5,24686e-11 / 1,70094e-11 m`; ordens 3,67/3,84/3,90/3,92.
Ordens dos esforços 3,95/3,96/3,94/3,89. Malhas 6 e 8 cumprem todos os limites
independentes; malhas 2/3/4 falham explicitamente. Custo Windows desta campanha:
4,45/5,93/7,47/10,65/13,53 s. O avanço histórico 4/8 continua separado,
comprovado nos dois SO no SHA 29dc614; o histórico 2/4 continua reprovado.

## TORSION: defeito de referência ainda não resolvido

O candidato mantém as verificações anteriores contra OpenSees/SO(3) e Kirchhoff
arquivados, inclusive equilíbrio próprio. A nova referência contínua fina passa
equilíbrio. Porém o OpenSees nativo reproduz Fx residual `-3,38565e-8 N` na
malha 32 e piora para `7,02357e-7 N` na 64. A alteração da tolerância Newton
1e-14 para 1e-12 na 64 não altera essa resposta. Não há evidência suficiente
para atribuir isso exclusivamente à tolerância ou corrigir a reação externa.
Os eixos nativos e a reconstrução SO(3) passaram. A qualificação conjunta é
recusada por equilíbrio; comparação do candidato com essa nova referência é
deliberadamente bloqueada. Nenhuma força foi corrigida ou zerada para fechar
equilíbrio. Resíduos de nós livres são preservados separadamente das reações
de apoio, conforme seu significado físico.

## Alongamento médio e limitações

A variância axial contínua é não nula, mas a energia correspondente por membro
SPATIAL é da ordem de 1e-12 J, muito inferior ao erro candidato da ordem de
1e-6 J. Logo essa parcela isolada não explica o erro observado. Permanecem
pendentes o acoplamento da parametrização material com a linha Hermite e a
validação geral da deformação média. Não se adicionou uma correção de energia
de outro campo à formulação candidata. Não está provada ausência geral de
locking, nem comportamento pós-crítico, empenamento, Wagner ou grandes rotações.

A distinção entre restrição sem cisalhamento e interpolação/discretização segue
o confronto conceitual com [Meier, Wall e Popp, §§4.1–4.3 e 6.3](https://arxiv.org/html/1609.00119).
Não se implementou automaticamente um elemento daquele artigo.

## Estado e CI

| Benchmark | Classificação e domínio |
|---|---|
| Cantilever | VERIFICADO NO DOMÍNIO DECLARADO histórico; nova malha 8 também passa localmente |
| SWAY | VERIFICADO NO DOMÍNIO DECLARADO histórico 4/8; novo estudo 6/8 passa localmente, 2/4 permanece reprovado |
| SPATIAL | PENDENTE: referência adicional qualificada localmente, candidato 4 ainda falha; 6/8 TIMEOUT |
| TORSION | BLOQUEADO: candidato e contínuo favoráveis, referência nativa fina falha equilíbrio |

Os resultados acima são da campanha local Windows. A CI Linux/Windows foi
ampliada para reproduzir referências, malhas brutas e hashes, preservando também
as campanhas históricas. O resultado do SHA final e a comparação entre SO ficam
no [PR #89](https://github.com/brunoJuniorBrz/JPN/pull/89) e em seus artefatos;
este registro não pressupõe que testes ainda em execução foram aprovados.
CI verde indica execução/auditoria, não aprovação automática dos benchmarks.

Mantidos 20 s/768 MiB, 500 kB/2 MB, todos os critérios, limites físicos e
conferência final de equilíbrio Newton. Sem alterações em produção ou C1.
`computed_structural_approval=false`, `fabrication_release=false`,
`release_gate=NOT_READY_BLOCKED`. Próximo esforço: custo do refinamento SPATIAL
sem remover auditorias, compatibilidade material e referência TORSION equilibrada.
