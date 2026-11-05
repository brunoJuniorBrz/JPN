# JPN — carga uniforme direta em barra (jpn.frame3d/2)

## Objetivo e referência externa

Reproduzir o comportamento elástico de uma terça isolada do estudo de
Marcelo Pratti Junior, *Análise de dimensionamento de perfis de cobertura
metálica: estudo de caso*, UFSC (2015):
https://repositorio.ufsc.br/handle/123456789/157233

Os valores de comparação são o vão biapoiado de **6,25 m**,
E = 205 GPa, inércia de flexão = 605 cm⁴ e carga de sucção
uniforme resultante de **1.778,8 N/m**. Os dados definem somente o
submodelo elástico da terça, não a cobertura ou o galpão inteiro.

A área da seção, a inércia no outro eixo, a torção e as condições
antitorsionais da fixture são hipóteses explícitas usadas para
isolar a flexão plana. Não são uma ficha completa de perfil comercial.

## Lacuna eliminada

O contrato anterior jpn.frame3d/1 aceita cargas somente nos nós.
Reproduzir essa terça exigiu subdividir a barra em muitos segmentos,
aproximar a carga uniforme e estudar a convergência da flecha.

O contrato aditivo **jpn.frame3d/2** permite informar
member_uniform_loads, com os campos estritos:

- member: ID existente da barra.
- case: ID existente do caso de carga.
- direction: apenas Fy/Fz **nos eixos locais** da barra.
- w_n_m: intensidade uniforme assinada em N/m.
- source: origem declarada da intensidade.

O PyNiteFEA 3.2.1 resolve diretamente a carga; sem alteração de
matrizes Ke/Kg nem do solver. Não há conversão implícita de
carga vertical global ou de pressão de telha para carregamento local,
nem peso próprio, força axial distribuída ou carga trapezoidal.

As cinco estações mantêm a convenção v1: ação da porção final sobre
a inicial, agora com integração exata da resultante e do primeiro
momento do carregamento uniforme. Apenas no v2 há o campo
displacement_local_m com dx, dy e dz na barra.

## Oráculo analítico independente

Viga biapoiada com carga transversal uniforme w:

- Reação por apoio: R = −w L / 2.
- Momento central: M = w L² / 8.
- Flecha central: delta = 5 w L⁴ / (384 E I).

Com w = −1778,8 N/m, L = 6,25 m, E = 205 GPa e
I = 605 × 10⁻⁸ m⁴:

| Grandeza | Analítico | JPN /2 |
| --- | --- | --- |
| Reação por apoio | +5.558,750 N | +5.558,750 N |
| Momento central local My | −8.685,546875 N·m | −8.685,546875 N·m |
| Flecha central local dz | −28,4955297 mm | −28,4955297 mm |

O resultado usa uma única barra. O equilíbrio global incorpora
explicitamente os resultantes e os primeiros momentos das cargas
uniformes, além das cargas e reações nodais.

Arquivo: engine/examples/ufsc-2015-purlin-uniform-v2.json.
Testes: engine/tests/test_frame3d_member_uniform.py.
Comando: python -m pytest engine/tests/test_frame3d_member_uniform.py -q.
Execução direta: python -m jpn_structural.frame3d, com JSON via stdin.

## Limites, integridade e próximo passo

- O contrato frame3d/1 mantém os mesmos resultados e validações.
- Entradas fora do domínio são recusadas antes do cálculo.
- Nenhum fator normativo ou resistência de aço é presumido.
- Este novo contrato ainda NÃO está ligado automaticamente aos
  formulários de projeto do aplicativo. Para isso, será preciso
  adaptar cargas superficiais e áreas tributárias às direções locais,
  com rastreabilidade, exclusividades e validação independente.
- Não é dimensionamento de perfil, ligação, contraventamento ou
  autorização de fabricação.
- O TCC apresenta divergências aritméticas em alguns carregamentos.
  O benchmark usa explicitamente a carga linear resultante publicada;
  não afirma conformidade automática com normas atuais.
