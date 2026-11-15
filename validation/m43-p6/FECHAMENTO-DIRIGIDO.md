# Fechamento dirigido — evidências e limites

Mesmo PR #89. Produção, P4/P5, C1/C2/M51 e visualizador não foram alterados.
Os resultados finais Linux/Windows e links dos artefatos ficam no corpo do PR.

| Problema | Antes | Depois local Windows | Evidência | Situação |
|---|---|---|---|---|
| Oráculo Claude | Contribuições exclusivas fora da branch | Integração seletiva, sem substituir testes anteriores | 156 testes P6 na etapa anterior | VERIFICADO NO DOMÍNIO DECLARADO |
| SPATIAL erro físico | Translação 5,18258× e energia 1,11341× na malha 4 | Quadratura e escala média excluídas como causas principais; resposta otimizada idêntica | Estado convergido, quadratura 8/16/32; refinamento independente já registrado | PENDENTE |
| SPATIAL custo | Jets e curvatura dominam profiling | Inversos idênticos reutilizados; mediana do kernel -3,91%; ganho global não demonstrado | Cinco amostras alternadas no mesmo processo e pares de malhas | PENDENTE: 6/8 ainda TIMEOUT local |
| TORSION equilíbrio | Fx 32=-3,38565e-8 N; 64=7,02357e-7 N | Déficit localizado nas equações dos nós livres; recuperação das reações coincide por dois caminhos | Três critérios, dois sistemas lineares, 10/20 passos | BLOQUEADO |
| Compatibilidade C1 | Ponte física sem teste específico | Seis casos: horizontal/inclinada, giro 0/30/90°, inversão, Iy≠Iz | Snapshot C1 e covariância de energia, Hessiana, forças e momentos | VERIFICADO NO DOMÍNIO DECLARADO do elemento isolado |

## Otimização e custo

O profiling mostrou 379.652 multiplicações de jets e 6,60 s cumulativos na
curvatura da malha 2 instrumentada. A única otimização reutiliza inversos de
`speed` e `den` calculados repetidamente na mesma quadratura. Mantém a ordem
dos produtos, o funcional e a quadratura. Doze estados exigem **igualdade
exata** de energia, gradiente, Hessiana e esforços físicos. Pares completos
de malhas 2/3/4 exigem igualdade de todo o objeto candidato, incluindo
iterações, esforços, equilíbrio e estabilidade.

Tempos baseline/reutilização nesta máquina: 2=11,21/11,73 s;
3=16,74/15,71 s; 4=19,28/19,31 s. Logo não se afirma ganho global consistente.
O microbenchmark alternado (cinco amostras de 25 chamadas, mesmo processo)
mediu razão mediana 0,96095; não substitui o limite do processo completo.
Malhas 6/8 atingiram 20 s nos dois modos. Nenhuma auditoria foi removida.
O profiling adicional da CI conserva snapshots parciais e picos de memória;
seus tempos incluem overhead e não são tempos de aceitação.

## Cinemática no mesmo estado físico

`kinematic_study.py` lê as coordenadas, movimentos e bases **de cada elemento
da malha 4 convergida**; avalia 8/16/32 pontos sem resolver modelos distintos.
Diferenças máximas: energia 2,78e-17 J; esforços/gradiente 2,05e-12;
Hessiana 4,47e-7 em escala de rigidez elevada (erro relativo de arredondamento).
O erro independente de energia 3,51754e-6 J não é explicado pela quadratura.

Para a linha Hermite, `dr/du = chord*(1,a,b)`, diretor tangente
`t=(1,a,b)/sqrt(1+a²+b²)` e `dS=L0 du`. Assim, velocidade material
`lambda=chord*sqrt(1+a²+b²)/L0`, curvatura `vee(RᵀR,u)/L0` e deformação
geométrica média `integral(lambda-1,du)`. A diferença dessa integral contra
a extensão média candidata dividida por L0 foi <=4,45e-16 nos elementos.
Não foi encontrado fator de comprimento ausente nem troca de eixo nesse teste.
Momentos físicos permanecem `J_left^-T` vezes os momentos conjugados; a
otimização preserva esses vetores exatamente.

No campo **candidato**, a soma EA*L0*Var(lambda)/2 foi 1,28660e-7 J (~3,7%
da diferença de energia), distinta da variância muito menor do campo contínuo.
Não é legítimo somá-la como correção: variaria o funcional e a solução.
Não explica sozinha o erro. A convergência já observada, próxima da quarta
ordem, e esses controles sustentam interpolação/discretização como contribuição
predominante no domínio estudado. Não constituem prova geral de ausência de
locking nem validação de toda parametrização em outros domínios.

## TORSION: duas montagens e controles independentes

O caminho A soma cargas e reações dos apoios na geometria deformada. O caminho B
monta todas as ações das extremidades nativas e subtrai cargas, distinguindo
componentes livres/restritas. Reações restritas coincidem exatamente; somar o
resultante livre ao caminho A fecha o equilíbrio global em ~1e-12. Portanto
o defeito observado não é explicado pela recuperação de reações ou por apenas
trocar a ordem da soma global. Restam resíduos nas equações dos nós livres.

| Malha | NormDisp/Band/10 Fx | NormDisp/UmfPack/10 Fx | EnergyIncr/Band/10 Fx | NormDisp/Band/20 Fx |
|---|---:|---:|---:|---:|
| 16 | 9,833e-9 | 9,833e-9 | 9,833e-9 | 9,833e-9 |
| 32 | -3,386e-8 | 5,141e-8 | -3,386e-8 | -3,386e-8 |
| 64 | 7,024e-7 | 7,024e-7 | -3,208e-7 | -3,208e-7 |

NormUnbalance com 1e-8 recusou as três malhas, sem relaxar o máximo de 50
iterações da referência. NormDispIncr=1e-14 e EnergyIncr=1e-16 não são testes
intercambiáveis de equilíbrio. O refinamento aumenta a sensibilidade; sistema
linear e trajetória alteram o resíduo, mas não fornecem solução fina confiável.
Os artefatos registram critérios, normas, iterações e recusas. Condicionamento
não é inventado: a interface escolhida não o fornece.

Isso estabelece uma limitação numérica reproduzível do oráculo: estagnação das
equações livres sob critérios de incremento/energia. Ainda não isola um único
defeito interno de ponto flutuante. A hipótese simplista de subtração direta
`Ln-L` foi descartada: a [fonte OpenSees 3.8.0](https://github.com/OpenSees/OpenSees/blob/v3.8.0/SRC/coordTransformation/CorotCrdTransf3d.cpp#L524)
já usa uma expressão de ponto médio para a extensão. Nenhuma reação foi
corrigida e a referência histórica permanece bloqueada. O contínuo independente
continua sendo evidência separada, não substituição retroativa da P5.

## C1 e reprodução

`c1_snapshot.py` é cópia somente para testes do arquivo `local_axes.py` do SHA
`2f215534d8f0d7c082fd32edd06b26e40dd93ae9`. O teste carrega-o em namespace isolado.
Usa poses prescritas com flexão biaxial, torção e extensão, verifica forças,
momentos físicos e rigidez no sistema global. Inverter a barra requer inverter
o sinal do giro declarado para preservar a mesma seção anisotrópica. Não é
teste do adaptador de produção nem autorização de integração automática.

```
python -m pytest experiments/m43_p6 engine/tests/test_p4_mechanics.py -q
python validation/m43-p6/directed_study.py --opensees-python CAMINHO_PYTHON_OPENSEES
python validation/m43-p6/kinematic_study.py
python validation/m43-p6/kernel_cost.py
python validation/m43-p6/profile_spatial.py
```

190 testes locais passaram (178 P6 + 12 históricos). A CI executa a campanha
independente existente e os novos estudos nos dois SO, além da suíte geral.
Resultados brutos ficam em `.tools/m43-p6/directed` nos artefatos da CI.
Permanecem `computed_structural_approval=false`, `fabrication_release=false`,
`NOT_READY_BLOCKED`, 20 s/768 MiB e todos os critérios históricos.
Sem merge, deploy ou mudanças no motor de produção. SPATIAL e TORSION não são
declarados globalmente resolvidos; as investigações solicitadas agora têm
experimentos e resultados reproduzíveis.
