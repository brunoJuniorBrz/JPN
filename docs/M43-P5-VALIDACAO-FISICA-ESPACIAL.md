# M43-P5 — validação física e numérica espacial

Entrega incremental sobre o PR #82, HEAD auditado `3f7569c`. M43 permanece
parcial. A investigação aprovou **um benchmark experimental**, manteve três
reprovados e não homologou o domínio espacial ou qualquer procedimento normativo.

## Causas comprovadas e correções

1. **Parametrizações diferentes:** DOFs rotacionais aditivos do OpenSees não
   equivalem ao vetor exponencial total da P4. A diferença chega a `1,328e-8 rad`
   na coluna. A referência agora reconstrói orientações a partir de todas as
   correções nativas de Newton, conferindo trace e mapeamento dos DOFs.
2. **Erro de malha na referência:** na coluna, a energia OpenSees com 16
   subdivisões é `5,716717677 J`; a referência contínua fornece `5,717347448 J`.
   Comparar somente a primeira distorcia a atribuição do erro ao JPN. Três malhas
   e uma estimativa assintótica explícita substituem essa comparação.
3. **Erro de discretização do candidato:** refinar a coluna de 4 para 12
   elementos permite passar todos os critérios. O braço ainda apresenta erro
   físico detectável, mesmo quando energia e esforços passam. O pórtico continua
   com momentos pequenos sensíveis à malha. O quadro não concluiu a tentativa
   refinada dentro de 20 s nesta máquina; o processo foi encerrado e o resultado
   antigo não foi apresentado como resultado dessa tentativa.

Os testes ampliados não identificaram erro no AD, na Jacobiana esquerda ou na
conversão dos momentos físicos. Isso sustenta a consistência interna da energia
adotada, sem provar sua equivalência contínua geral. **Nenhuma fórmula do motor
foi ajustada para reproduzir uma referência.** Os cinco fontes centrais Python/TS
da P4 permanecem idênticos, verificados por hash.

## Antes/depois, sem alterar tolerâncias

Erros de energia abaixo usam **a mesma referência OpenSees extrapolada** nas duas
colunas. O arquivo histórico também preserva a comparação original da P4.

| Caso | Malha anterior → avaliada | Erro U antes → depois (J) | Resultado P5 |
|---|---|---|---|
| Coluna biaxial comprimida | 4 → 12 | `3,490e-6` → `2,719e-8` | Passa comparação completa, refinamento e ambos os oráculos |
| Pórtico fora do plano | 2 → 4 por barra | `6,116e-6` → `3,774e-7` | Falha em componentes e refinamento |
| Quadro com quatro pilares | 2; tentativa de 4 interrompida | `4,305e-5` → sem nova solução | Falha; limite de tempo preservado |
| Braço excêntrico físico | 2 → 8 por barra | `4,476e-7` → `6,446e-10` | Falha em deslocamento e orientação física |

A coluna tem erro máximo de deslocamento `1,503e-11 m`; a auditoria angular
também passa contra a barra contínua independente. No braço, o erro angular
remanescente é `4,659e-10 rad`, acima do limite aproximado `1,67e-10 rad`.
O componente vertical de ARM difere `4,659e-10 m`; ele continua reprovado.
No pórtico, um momento governante é `-0,121637` contra `-0,124767 N·m`.
Não se descartaram esses componentes por serem pequenos.

A campanha mantém `rtol=1e-7`, equilíbrio `1e-8`, refinamento `1e-4`, os pisos
absolutos anteriores e os limites 150 nós/320 barras, 20 s/768 MiB. Todas as
matrizes finais e seis resultantes ficam na [evidência](../validation/m43-p5/evidence.json).
Os ensaios adicionais cobrem derivadas nas 12 coordenadas, Hessiana, trabalho
conjugado, SO(3), objetividade, similaridade dimensional, seis modos rígidos,
valores próximos de zero e soluções analíticas do oráculo contínuo.

## Integração e limites

A auditoria TypeScript da P4 verifica o resultado refinado completo e rejeita
orientação adulterada; uma comparação SO(3) independente repete os casos que
passam e falham. Não há nova rota produtiva, alteração de preparação física,
UI, permissões, cancelamento ou proteção contra respostas obsoletas.
`mixed3d/1,/2`, `second-order-frame/1,/2,/3` e o caminho linear são preservados.
As proteções de deploy estão desativadas também para a branch P5.

`production_enabled=false`, `computedStructuralApproval=false`,
`fabricationRelease=false`, `spatial_domain_verified=false` e `NOT_READY_BLOCKED`
continuam obrigatórios, inclusive no benchmark numericamente aprovado.

**P6 recomendada:** reduzir o custo da montagem/Hessiana mantendo a mesma
energia e os mesmos guardas, provar refinamento dos três casos restantes e
obter uma referência contínua independente para os pórticos fechados. Depois,
avaliar momentos aplicados com trabalho conjugado demonstrado. Cargas
distribuídas no estado deformado, liberações, flexotorção, empenamento e Wagner
continuam dependentes de validação espacial adicional; não foram implementados.

Comandos, equações, fontes e condições da estimativa de erro:
[campanha M43-P5](../validation/m43-p5/README.md). A CI Linux/Windows publica a
evidência real de cada execução; CI verde significa regressões e bloqueios
preservados, não homologação automática dos casos reprovados.
