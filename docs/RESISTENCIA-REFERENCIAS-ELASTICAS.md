# Referências elásticas teóricas por peça — desenvolvimento experimental

## Objetivo

Fase adicional da preparação para dimensionamento, após Missão 21 e sua auditoria. O motor passa a calcular referências **analíticas e não normativas** para uma peça com propriedades físicas explicitamente cadastradas. O fluxo **não calcula resistência de projeto nem taxa de utilização**, não classifica peças como seguras, não influencia o solver PyNite, não atualiza os quantitativos e **não autoriza fabricação**.

## Fluxo e dados obrigatórios

1. Selecionar uma peça existente no painel de carregamentos físicos.
2. Informar o conjunto de propriedades físicas do grupo correspondente: `E`, área `A`, inércias `Iy` e `Iz`, orientação e fontes/revisões documentadas.
3. Registrar para a peça: família do perfil, `fy`, `fu`, comprimentos **efetivos declarados** de flambagem Y/Z, condições de contenção e fonte/revisão.
4. Consultar no painel somente as referências teóricas disponíveis. Alterações nesses campos provocam recálculo das referências e, pelos mecanismos existentes, invalidação dos resultados físicos pertinentes.

**Não inferir coeficientes K de apoio, comprimentos efetivos, aço, módulos, inércias ou geometria efetiva.** Comprimento de fabricação entre nós não equivale automaticamente ao comprimento efetivo de flambagem.

Os dados são lidos do projeto sem modificar o schema persistido; os resultados são derivados em memória e não persistidos nem transmitidos ao worker.

## Definições SI e referências estritamente analíticas

- `A[m²] = A[cm²] × 10⁻⁴`
- `I[m⁴] = I[cm⁴] × 10⁻⁸`
- `E[Pa] = E[GPa] × 10⁹`
- `fy[Pa] = fy[MPa] × 10⁶`
- `r_i = sqrt(I_i/A)`, `λ_i = L_ef,i/r_i`
- `N_y,bruto = fy × A`, **referência de escoamento bruto sem coeficientes, não resistência de cálculo**
- `N_cr,i,Euler = π² E I_i / L_ef,i²`, **somente modelo teórico elástico idealizado**

Todas as forças são exibidas em kN.

**Nenhuma destas fórmulas equivale a verificação das normas ABNT para barras e ligações.** Em especial, Euler não trata flambagem local, distorcional, lateral com torção, interação entre esforços, imperfeições, flexão composta, instabilidade global, efeitos de segunda ordem nem resistências das ligações. Para perfis formados a frio, o aviso sobre flambagem local/distorcional é explícito.

## Normas a considerar em fases futuras

- [ABNT NBR 8800:2024, versão corrigida:2025 (Catálogo ABNT)](https://www.abntcatalogo.com.br/) — estruturas de aço e mistas conforme o escopo da norma, edição a confirmar na data de dimensionamento.
- [ABNT NBR 14762:2010](https://www.abntcatalogo.com.br/) — perfis formados a frio; revisão/validade deve ser conferida antes de implementar cláusulas.

**Não foram copiadas equações normativas nem alegada conformidade**, porque o texto integral de cada norma, seus exemplos e suas condições de aplicação devem ser analisados pelo engenheiro responsável antes de codificar as verificações resistentes reais.

## Testes

- Cálculo independente em SI para seção sintética com `A=10 cm²`, `Iy=100 cm⁴`, `Iz=25 cm⁴`, `E=200 GPa`, `fy=250 MPa`, `LefY=2 m`, `LefZ=3 m`.
- Escalas físicas: `Ncr∝I`, `Ncr∝1/L²`, `λ∝L`, escoamento bruto independente de `L`.
- Sem aprovação em nenhuma circunstância; entradas ausentes, revisão/fonte faltante, propriedades contraditórias, ID trocado e valores numéricos que extrapolam o domínio são bloqueados.
- Testes da pilha M21 e auditoria #25 preservados; nenhuma mudança em `engine/`, geometria estrutural, cargas, exportação, seleção comercial, banco ou solver.

## Próximo checkpoint — ainda NÃO implementado

Pedir acesso à íntegra da edição normativa vigente e exemplos de dimensionamento auditáveis. Definir material e família de seção, condições reais de contenção, fatores de segurança, combinações, estados-limites, verificações locais/globais/ligação e interações. Só então desenvolver um verificador normativo isolado com revisão de engenheiro, confrontando também as forças internas do solver com casos independentes.
