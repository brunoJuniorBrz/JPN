# N14: cobertura revisada em planta retangular (parcial; pergunta ao Tom)

Construído sobre o N2. Fonte: NBR 6123:2023 corrigida, Tabela 7 (figura e Nota 3, doc p.21)
e Tabela 8 (figura e Nota 1, doc p.22). Mantidos `computedStructuralApproval=false`,
`fabricationRelease=false`, `NOT_READY_BLOCKED`.

## Liberado

- **Planta retangular a ≥ b**, com b = largura (lado menor, no sentido da inclinação) e a = comprimento
  (ao longo da cumeeira). Se a largura for maior que o comprimento, a análise é bloqueada.
- **Duas águas, vento a 90°:** EFI em toda a água de barlavento e GHJ em toda a de sotavento.
  Nesse caso não há divisão em zonas ao longo de a, então a/b não muda nada.
- **Uma água, vento a 90° e −90°:** H e I / L e J, em metades de b (linha de centro da figura da Tabela 8).
- **Nota 3:** `note3IJCoefficient` implementa a regra (a/b = 1: igual a F/H; a/b ≥ 2: −0,2; linear
  entre os dois) e foi conferida contra cálculo à mão. Ainda não é usada: depende da pergunta abaixo.

## Parado: pergunta para o Tom

**Duas águas, vento a 0° (paralelo à cumeeira), com a/b > 1.** A figura da Tabela 7 cota só a faixa
E/G, com x = b/3 ou a/4 (o maior dos dois, porém ≤ 2h). A linha que separa F/H de I/J aparece
traço-ponto e **sem cota**. Com a/b > 1, a Nota 3 dá a I/J um valor diferente de F/H, então esse
limite é necessário para montar as zonas.

> Pergunta: em planta retangular com vento a 0°, onde termina a zona F/H e começa I/J? Por exemplo,
> em a/2 (como as notas a e b da Tabela 8 usam para uma água), ou em outra posição? Qual a fonte?

Até a resposta, esse caso é bloqueado com `TABLE7_FH_IJ_LIMIT_UNDEFINED`. Nenhuma cota foi assumida.

A uma água a 0° (Tabela 8, notas a e b: b/2 e a/2) continua fora do domínio revisado, como antes.

## Aceite

`src/domain/reviewed-roof-rectangular.test.ts` cobre:
- duas águas a 10° com a/b = 1,5 e 2 (vento a 90°);
- uma água a 10° com a/b = 1,5 e 2 (90° e −90°);
- o pipeline completo com a/b = 2;
- o bloqueio do vento a 0° e do lado b maior que a;
- a Nota 3 contra cálculo à mão.
