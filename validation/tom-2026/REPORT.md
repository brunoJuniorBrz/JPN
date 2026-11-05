# Auditoria independente — main integrada vs projeto Tom

**Data:** 2026-11-05

**Repositório:** `brunoJuniorBrz/JPN`

**Main executada:** `cc516b6f5cc97750de5aecf7564fcaff47a1d4f3` (PR #50 merged).

**Fontes reais:** `planta baixa(2).pdf` e `ton valores(2).pdf`, ambos de uma página. PDFs originais não foram publicados no Git; somente dados numéricos transcritos.

## 1. Integração

- PR #50 foi confirmado merged na `main` no SHA acima.
- Workflow `42078380114`: **9/9 jobs sucesso**; abrange aplicação, build e motor em Windows/Linux. O relatório do PR registra 503 testes TypeScript e 86 Playwright.
- `project-workbench.tsx` e `mixed-analysis-workspace.tsx` agora utilizam `resolvePhysicalStructure` em pontos de integração, cobrindo modelos gerados e declarados.
- O fluxo de importação de JSON, preservação do orçamento, preparação física, worker e recuperação de resultados tem testes no PR #50.
- A `main` não foi implantada automaticamente; manter essa condição até revisão operacional.

## 2. Resultado comercial real

Reproduzido **no cálculo `calculateEstimate` do JPN**, não apenas por soma manual:

| Grupo | Planilha (R$) | JPN (R$) | Resultado |
|---|---:|---:|---|
| 6 peças U 75×40×2,65 | 810,00 | 810,00 | CONFERE |
| 20 peças U enrijecida 75×40×2,65 | 3.100,00 | 3.100,00 | CONFERE |
| Telhas TR25 0,43mm (31 peças, 107,65 m lineares) | 3.767,75 | 3.767,75 | CONFERE |
| 600 brocantes | 360,00 | 360,00 | CONFERE |
| Consumíveis | 1.613,54 | 1.613,54 | CONFERE |
| Mão de obra informada | 0,00 | 0,00 | CONFERE |
| **Total** | **9.651,29** | **9.651,29** | **CONFERE** |

O sistema só reproduz os valores **quando as quantidades são informadas manualmente**; ele não inferiu quantidades de telhas/perfis da planta irregular.

**Atenção:** seis peças comerciais destinadas à tesoura não equivalem necessariamente a seis tesouras completas.

## 3. Geometria

Cotas visíveis na planta incluem 14,28m, 9,02m, 5,38m, 5,48m, 5,26m, 4,51m e vários recortes. O retângulo de referência 14,28×5,38 = 76,8264 m² **não é a área líquida da cobertura**, que permanece sem reconstrução verificada. O croqui oferece vistas diferentes, não coordenadas de todos os nós/barras com vínculos físicos completos.

A importação de um segmento **explicitamente ilustrativo** de 5,38m passou e preservou o orçamento. Sem apoios, cargas e propriedades ele é corretamente recusado como análise estrutural pronta.

## 4. Solução numérica experimental com comprimento presente no desenho

Executado o solver Python verdadeiro da `main` com um balanço de dois elementos totalizando 5,38m, propriedades **sintéticas**, engaste explícito e carga pontual **sintética de 100N**:

- Flecha do JPN: `-24,33138625000012 mm`.
- Solução analítica independente para esse modelo: `-24,33138625 mm`.
- Deslocamento axial do JPN: `0,0020175 mm`.
- Solução analítica independente axial: `0,0020175 mm`.
- Resíduo relativo do equilíbrio: `6,864116003027285e-16`.
- Gate de liberação: `NOT_READY_BLOCKED`, fabricação `false`.

**Não são forças ou deflexões reais da obra do Tom**. O comprimento é tomado do desenho, mas as propriedades, barras, apoios e cargas são didáticos. Esse ensaio testa apenas a capacidade numérica do motor integrado.

## 5. Limitações objetivamente confirmadas na main

1. `transferTakeoff()` lança `DECLARED_STRUCTURE_UNSUPPORTED` para modelos estruturais declarados. O orçamento manual funciona; quantitativo físico **automático** da cobertura irregular não.
2. `adaptLoadedMixedProject()` rejeita cargas uniformes, peso próprio, carregamentos de cobertura e vento para estruturas declaradas. A análise nodal declarada já funciona; o caminho físico das ações por área/perfil declarado ainda não está conectado.
3. O gerador paramétrico de cobertura não reconstrói a geometria recortada do Tom; usar um retângulo envolvente produziria área potencialmente errada.
4. A planilha não identifica com precisão geometria das tesouras, posição dos pilares e apoios, vínculos, propriedades resistentes dos perfis U/Ue, classificação do aço, ligações, nem forças de projeto de vento. Sem isso **não há teste honesto de dimensionamento estrutural real**.
5. Os 107,65 m são metragem linear das telhas, não área em m². Falta largura útil/recobrimentos para conferir fechamento da cobertura.

## 6. Execuções e reprodutibilidade

- Primeira rodada isolada no SHA `cc516b6`: **47/47 testes direcionados passaram**, combinando 44 existentes de importação/M34 e 3 novos de dados comerciais do Tom.
- Ensaio Python do balanço de 5,38m: **1/1 passou**, com fórmula independente e resposta real de worker.
- A primeira tentativa de suite completa no sandbox combinou `NODE_ENV=development` global com instalação Python incompleta; produziu falhas de harness e de execução Python. **Não contar como regressão da main.** O GitHub CI usou ambiente adequado; um segundo sandbox instalou pacote `jpn_structural` em modo editável e executou **55/55 testes direcionados passaram** com configuração limpa, inclusive casos anteriormente falhos de normas e runner HTTP.
- Teste permanente deste PR em `src/domain/tom-real-commercial.test.ts`: **4/4 passed** em sandbox real, com `pnpm typecheck` aprovado; testa compras manuais, importação declarada, preservação comercial e bloqueio explícito de uniformes em declarado.
- **Não** afirmar que uma campanha integral de engenharia de um galpão Tom foi executada: ela depende de dados que as fontes não documentam.

## 7. Próximas correções de maior impacto

1. Completar modelo geométrico **com recortes** e atribuição real de barras/apoios, sem confundir as 6 peças comerciais com 6 treliças.
2. Integrar cargas distribuídas/peso próprio ao fluxo `physicalStructure` declarado, aproveitando `mixed3d/2`.
3. Construir o quantitativo automático de barras a partir da geometria declarada, mantendo divergência vs planilha explícita.
4. Cadastrar propriedades de seção/material **reais e rastreáveis** e revisões de ligações/apoios e carregamentos.
5. Somente então executar o caso estrutural Tom, comparando forças, deslocamentos e verificações com referências independentes.

**Status:** funcionamento do núcleo integrado confirmado nos domínios ensaiados; **cálculo estrutural real completo da obra Tom: bloqueado por dados/funcionalidades ainda não integradas**.

**Nada neste PR altera fórmulas do solver, executa deploy, autoriza dimensionamento final ou fabricação.**
