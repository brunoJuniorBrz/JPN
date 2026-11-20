# Especificação — Editor de tesoura (entra na modernização da interface F1–F6)

Origem: obra 8 × 10 m do Tom (18/11/2026). A tesoura foi passada por mensagens e croquis
(7,5 cm na ponta, 80 cm no lado alto, painel de 50 cm a partir do lado alto, diagonal de 94 cm,
15 + 40 + 20 cm de apoio/calha/folga antes da ponta) e teve de ser montada à mão no código
(`src/lib/exports/tom-8x10-cad.test.ts`). O gerador atual só aceita "altura no lado baixo" e
"número de painéis iguais". A tesoura é a peça que o Tom mais confere: ele precisa ajustá-la sozinho.

## O que o usuário vê

1. **Duas abas no 3D:** *Obra* (cobertura completa, como hoje) e *Tesoura* (só a tesoura, vista de
   frente, grande, cotada, legível no celular).
2. **Abre preenchida com os dados mínimos**, todos editáveis em cm:
   - distância de muro a muro (vão total);
   - recuo da ponta baixa = apoio da calha + calha + folga (ex.: 15 + 40 + 20);
   - altura na ponta e altura no lado alto, **ligadas à caída (%)**: mudou uma, recalcula a outra
     (aviso se o usuário fixar as três de forma incompatível);
   - painel padrão (ex.: 50 cm) e o lado a partir do qual se conta; a sobra vai para a ponta oposta;
   - diagonal: sentido, sem diagonal ou em X;
   - perfil dos banzos e perfil de montantes/diagonais.
3. **Ajuste ponto a ponto:** tocar num montante → mudar posição e altura em cm; acrescentar/remover
   montante; inverter a diagonal de um painel; arrastar o ponto de emenda do banzo.
4. **Terças presas aos nós:** cada terça encaixa num nó do banzo superior; aviso visível se alguma ficar
   fora de nó.
5. **Atualização em tempo de execução:** comprimento de cada peça, barras por perfil, peso, plano de corte
   e preço mudam a cada ajuste. Opção de orçamento **"medida cheia"** (todo montante com a altura máxima,
   como o Tom orça), ao lado das medidas reais; o plano de corte sempre usa as reais.
6. **Uma tesoura vale para o tipo:** ajustou uma vez, todas as tesouras do tipo saem iguais no 3D, no CAD,
   na lista de materiais, no plano de corte e no PDF.

## Motor (domínio)

- Novo modelo **"tesoura por estações"**: lista ordenada de estações `{x, alturaMm}` (posição e altura de cada
  montante), recuo da ponta, sentido das diagonais por painel, posição da emenda de cada banzo, perfis.
  Gera a estrutura declarada (nós e peças) consumida pelo pacote CAD — mesmo caminho do caso 8 × 10.
- Validações: estações em ordem crescente, alturas > 0, nenhuma peça maior que a barra comercial sem emenda
  declarada, terças em nós (ou aviso), caída coerente com as alturas.
- Nada disso aprova estrutura: `computedStructuralApproval=false`, `fabricationRelease=false`,
  `NOT_READY_BLOCKED` permanecem.

## Aceite

- Reproduzir pela tela, sem código, a tesoura de `tom-8x10-cad.test.ts`: 7,25 m, 75 → 800 mm, montantes a cada
  500 mm a partir do lado alto e 250 mm na ponta, diagonal do 1º painel 943 mm, terças a cada 1,50 m + ponta;
  resultado: 8 barras U 4", 9 barras de cantoneira 7/8", 12 barras de Ue; mesmas pranchas do teste.
- Mudar o painel para 60 cm na tela atualiza contagem de barras e PDF sem recarregar.
- Usável por quem tem dificuldade com celular (o Tom): botões grandes, números em cm, sem jargão de código.

## Pendente para depois (não bloqueia o editor)

- Detalhe da calha rebaixada com platibanda e do apoio da ponta baixa (medidas do croqui: 15 / 40 / 20 / 12,5).
- Detalhe da ancoragem no muro alto (croqui: 15 / 20 / 80 / 20 / 1 m).

## Apoios mistos muro/pilar (nov/2026)

Cada ponta de cada tesoura escolhe o que fica embaixo: **muro existente** ou **pilar novo**
(`lineSupports`; vazio = segue o modo da obra, então projetos antigos não mudam). A geometria
da tesoura (vão, recuo da calha, painéis) continua a da obra; muda só o apoio da ponta.

- **Modelo físico:** pilar (piso → banzo inferior) só nas pontas em pilar; ponta em muro apoia
  direto no nó do banzo inferior.
- **Vínculos declarados no editor** (`supportModel`, hipótese do construtor, não presunção do motor):
  base do pilar engastada (padrão) ou articulada; muro com translações e torção (RX) contidas pela
  chapa soldada, giro no plano livre; tesoura entre dois muros com uma ponta deslizante em X
  (padrão; duas águas: direita; uma água: ponta baixa — a ancoragem do muro alto fica fixa).
- **Interfaces físicas** por nó (`supportInterfaces`): `existing-masonry` ou `new-steel-column`, lado
  A/B, caminho de carga e base da restrição. Muro existente fica `hypothesis` (e bloqueia o cálculo
  com `EXISTING_SUPPORT_PENDING`) até preencher "Muros conferidos no local por…", que vira
  `site-reviewed` com o texto como evidência. A trava não foi afrouxada.
- **Orçamento:** pilares só onde é pilar; chapa de base (pilares) e chapa de ancoragem (muros)
  separadas; chumbadores por chapa.
- **3D e CAD:** muro só nos trechos com muro; chapas só nas pontas em muro; corte esquematiza o
  muro do lado que tiver muro (com as tesouras, se for parcial).
- **Cálculo real:** `src/domain/truss-mixed-supports.test.ts` roda PyNite numa obra em que o muro
  da direita acaba na 3ª tesoura: equilíbrio, compressão em todos os apoios, ponta deslizante sem
  empuxo e auditoria de reação por interface (capacidade pendente, sem aprovação normativa).
