# Missão 25 — Dossiê preliminar de materiais e pré-fabricação

**Estado:** implementado em branch isolada como módulo de **pré-fabricação**, sem autorização para compra, corte ou execução. Base: `integration/m21-studio-release-candidate` no SHA `92b9a2836e9cdb50553f98173f300e425acef877`.

## Entregas

- `src/domain/calculations/preproduction.ts` — relatório de rastreabilidade que lê o mesmo modelo geométrico do desenho, do corte e do orçamento; não copia ou modifica os cálculos estruturais.
- `src/lib/exports/preproduction.ts` — exportações PDF e XLSX com identificação de projeto e revisão, grupos de material, peças individuais, massa conhecida, simulação de barras comerciais e pendências.
- `src/components/planning/project-workbench.tsx` — aba **Pré-fabricação**, com resumo e downloads de documentos preliminares.
- `src/domain/calculations/preproduction.test.ts` — reconciliação de comprimentos, peças, massa, proteção contra falta de dados e invalidação de comprimentos após alterações geométricas.

## Contrato e fluxo

`jpn.preproduction/1` é derivado do `StructureModel` já existente. **Nunca** retorna aprovação técnica nem documento com status de liberação. As entradas mantêm `geometrySignature`, `roofRevision`, ID da peça, nós de origem e destino, família do perfil, nome, grau de aço, fonte, massa linear, comprimentos geométrico/final declarado e estado do registro.

Grupos de materiais são consolidados por família, nome de perfil, aço, fonte e comprimento comercial — não se misturam perfis de aços ou fornecedores/especificações diferentes só porque têm o mesmo comprimento.

Os comprimentos de fabricação dependem do conteúdo integral da assinatura `roof + planning`; qualquer mudança na geometria ou nos perfis invalida os cadastros. Registros duplicados ou de peças órfãs são detectados, e comprimentos finais duplicados não podem ser usados na simulação.

O plano de corte continua sendo o algoritmo heurístico existente, com perdas declaradas de serra e extremidades e comprimento comercial por perfil. `status="simulation_only"` em todos os casos. A simulação não determina por si só a compra definitiva.

## Bloqueios explícitos

- Vento e combinações normativas, dimensionamento de perfis, estabilidade e ligações não comprovados — pendentes com o Codex (Missões 22–24).
- Chapas, parafusos, soldas, ancoragens e contraventamentos sem detalhamento e quantitativos.
- Telhas comerciais, sobreposições, fixações e acessórios sem quantitativos validados.
- Perfis de pré-visualização e dados incompletos não são promovidos a especificações comerciais.
- Comprimentos declarados pelo operador **não** equivalem a medidas finais verificadas de fabricação.
- Sem aprovação de projeto, revisão assinada de engenharia, assinatura digital do pacote de fabricação, procedimento de inspeção ou ordem de produção.

**Nenhum documento deste PR é liberado para produção.** Os PDF/Excel trazem os avisos e uma lista explícita de pendências. A referência ao `geometrySignature` é identidade de dados, não certificado ou assinatura digital.

## Integração futura com o dimensionador normativo

Após as Missões 22–24:

1. Consumir `DesignResult` com entradas, normas, edições, ações, apoios e resultados verificados, sempre associando ao hash/revisão do modelo; nunca inferir aprovação apenas por haver resultados do PyNite.
2. Consumir `ConnectionResult` com desenho de fabricação, apoios, chapas, fixadores, soldas, contraventamentos e respectivas quantidades efetivamente detalhadas.
3. Acrescentar especificações e procedimentos para telhas, sobreposições, cortes inclinados, furos, soldas, tratamento superficial, transporte e montagem.
4. Revisão humana assinada pelo engenheiro e documentação de responsabilidade técnica antes de permitir etiqueta **liberado para produção**.
5. Criar um fluxo explícito de revisão congelada, reaprovação após mudança e evidência de expedição/aceite, sem alterar silenciosamente documentos anteriores.

Este PR foi desenvolvido sem editar o solver Python ou os algoritmos de vento, dimensionamento e ligações. Nenhum deploy automático em Vercel está habilitado para esta branch.
