# Módulos isolados de resistência de ligações — NBR 14762:2010

## Escopo e estado

Implementação **funcional e testável**, ainda **não integrada automaticamente ao UI, modelo de ligações ou solver de forças do JPN**. Base da branch: PR #37 commit aa80040. Trabalho criado em branch separada para não sobrescrever a continuação local ainda não publicada do Codex.

**Em nenhuma hipótese os resultados liberam a ligação inteira, estrutura, compra/corte ou fabricação.** O status \`PASS-ISOLATED-CHECKS-ONLY\` refere-se somente às verificações enumeradas; \`FAIL-ISOLATED-CHECKS\` indica reprovação ao menos em um modo. Reações/cargas não são geradas: são valores **por parafuso ou cordão, explicitamente informados** para a combinação ULS.

## Verificador 1 — Um parafuso, duas chapas, cisalhamento simples

Arquivos:
- \`engine/jpn_structural/single_bolt_14762.py\`
- \`engine/tests/test_single_bolt_14762.py\`
- \`engine/check_single_bolt.py\`
- \`engine/examples/single-bolt-14762.json\`
- \`engine/tests/test_single_bolt_cli.py\`

Domínio rígido: um parafuso passante com furo circular padrão em **duas partes planas** de espessura máxima **4,75 mm**, solicitação direta e concêntrica, um plano de cisalhamento, sem outros furos/parafusos ou ações excêntricas. O local do plano de corte nas roscas e a qualificação do parafuso são declarados, sem inferência de material.

Procedimentos: §10.1 para a força mínima de ligação de barra axial (quando aplicável e resistência axial declarada); §10.3.2 para máximo de diâmetro de furo padrão; §10.3.3.1 para distância livre mínima ao bordo; §§10.3.4–10.3.5 para rasgamento ao bordo e esmagamento em **ambas** as partes; §§10.3.6–10.3.7 para resistência do parafuso à tração e ao cisalhamento; §10.3.8 para interação segundo a qualificação declarada. Os resultados incluem unidades N, caso, ID da ligação, SHA256 da entrada, modos governantes por verificação, demanda, resistência e utilização.

**Execução offline** no diretório raiz:

\`\`\`bash
python engine/check_single_bolt.py engine/examples/single-bolt-14762.json
\`\`\`

O exemplo tem **dados sintéticos**, não é desenho de ligação real. Código de saída 0: somente modos isolados PASS; 2: um modo FAIL; 3: entrada não representável/ inválida. Aceita \`--output resultado.json\` para registrar a evidência.

**Não valida:** resistência da seção líquida completa/chapa, colapso por rasgamento em bloco (§10.4), distribuição entre múltiplos parafusos, esforço excêntrico, prying, deslizamento, ancoragens, rigidez semirrígida, a geometria efetiva do cadastro JPN, nem situação física de montagem. Isso obriga o gate global a continuar bloqueado.

## Verificador 2 — Solda de filete plana e carregamento direto

Arquivos:
- \`engine/jpn_structural/flat_fillet_weld_14762.py\`
- \`engine/tests/test_flat_fillet_weld_14762.py\`

Domínio: um cordão **plano**, junta de sobreposição idealizada, força somente **paralela ou normal** ao eixo da solda, sem combinação/eccentricidade/momento, materiais e dimensões declarados e duas chapas com espessura máxima 4,75 mm. O usuário deve assegurar que essa hipótese corresponde a uma ligação física possível.

§10.2.3:
- Ruptura do metal-base para força paralela ao cordão, incluindo os dois ramos de \`L/t\`;
- Ruptura do metal-base para força normal ao cordão;
- Limite adicional por ruptura da solda quando a espessura menor supera 2,5 mm;
- Garganta estimada por perna mínima da solda, com hipóteses geométricas explícitas.

**Não valida:** grupo de soldas, ação excêntrica, dimensões mínimas de execução, soldabilidade/qualidade, ruptura da peça em outros modos, resistência de múltiplas juntas, 10.2.4 em superfície curva ou exigências adicionais AWS.

## Testes reais executados localmente nesta campanha

\`PYTHONPATH=engine python -m pytest -q engine/tests/test_*14762.py engine/tests/test_single_bolt_cli.py\`

**29 testes aprovados** em ambiente Python do assistente, incluindo controles aritméticos independentes e condições de reprovação. Não equivale à execução da suíte completa e não comprova os valores da obra; a CI do GitHub deve ser observada no SHA final.

## Regras de integração ao PR #37

1. Preservar o progresso **local não publicado** do Codex sobre pyCUFSM, vento, rastreabilidade e normalização de hashes; não substituir esses arquivos por versões remotas antigas.
2. Integrar os dois contratos gradualmente ao cadastro de ligações existentes, cruzando IDs, geometria física, detalhes de furos e esforços concomitantes. Não confiar em dados sintéticos do exemplo.
3. Antes de liberar a ligação inteira, completar demais estados-limites pertinentes, resistência/rigidez efetiva e combinações; quando relevante, atender a NBR 8800:2024 corrigida:2025, 6123 e 8681 aplicáveis.
4. Manter \`computedStructuralApproval=false\` e \`fabricationRelease=false\` para todos os casos.
5. Reexecutar a campanha completa no ambiente real Windows/Linux e reproduzir verificações independentes.

Norma conferida visualmente no PDF fornecido pelo usuário: NBR 14762:2010, §§10.1–10.3.8, sem reproduzir texto integral protegido. Implementação é engenharia de software experimental, não certificação ou ART.
