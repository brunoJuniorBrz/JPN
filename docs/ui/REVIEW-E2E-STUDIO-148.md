# Revisão de adaptações E2E no Studio F1 — PR #148

Commit-base da revisão: `73d86fdf0905205e93630251b339ccb9292c9891`. Referência histórica congelada: `6f473efa5350a498e444a7f006881a71e7ae9d59`.

A auditoria da integração geral confere blobs Git de testes históricos. Esta emenda registra explicitamente os testes de interface que tiveram **seletores e expectativas de navegação ajustados** porque as abas antigas foram substituídas pelo Studio F1 (etapas Obra/Geometria/Estrutura/Tesoura/Cargas/Análise/Verificação/Materiais/Arquivos e 3D permanente). Não elimina as referências históricas nem a CI. O hash de cada versão anterior é preservado no Git e listado aqui; as condições de cálculo, fabricação e segurança não podem ser relaxadas.

| Teste | Blob histórico | Blob adaptação | Motivação |
|---|---|---|---|
| `tests/e2e/planning.spec.ts` | `f8fc3ea1abbab35f34d99c2aefbeaba1b5076c13` | `867b51766b4ca077de22476ec27a26d2ef0aea49` | Resultado/Ir para resultado passou à etapa Materiais; mantém quantitativos e exportações |
| `tests/e2e/platform.spec.ts` | `69927ba653c77382a88ba8d8f416ef0401c808d9` | `fdba218571b7e2da818bb4e0af6bd2f173e94587` | Etapa Materiais e botão Abrir modelo 3D substituem seletores da navegação antiga |
| `tests/e2e/presentation-3d.spec.ts` | `484638c2951722a7a10e117f4cf0bf2e644cdc0d` | `a74f874614f2da6b8cf2c5b815c585391ec72cea` | Abre a visualização 3D antes de verificar renderização e personalização |
| `tests/e2e/profiles-3d.spec.ts` | `35ac9b70990f488b76a229f090d168776940a2c9` | `f089b2f011589c798fd20a610fd092a745b0a219` | Atualiza exclusivamente o comando de abertura do modelo 3D |
| `tests/e2e/result-workspace.spec.ts` | `726f04b4561474215367acd6e73bda371281e1c0` | `e7dfc14ec6db7bd4225c8e0d4a5f8d55330451d5` | Viewer 3D permanece visível no Studio; checa Verificação e preparação física pelo trilho |
| `tests/e2e/spatial-analysis.spec.ts` | `2c57cfe7513c299d8466fd4457a022853379faac` | `68f2843c570444ae00af87b82c5fb7997e935e17` | Abre o visualizador antes de exigir WebGL e análises espaciais reais |
| `tests/e2e/spatial-coordination.spec.ts` | `f9c4c2d5bb3e12196ae3c3961b4fee933c810fde` | `7d18f889b1f769a8b1cfd07a194ffd0f8c1c9dbd` | Substitui etapa Resultado obsoleta por Análise sem alterar verificações físicas |
| `tests/e2e/spatial-preparation.spec.ts` | `3de5f4535cd5394ec000e3f12cca5fa7c6030e68` | `1e78b58ca8c5405c7e66ad71300e3e752d7f8ea4` | Substitui etapa Resultado por Análise, preservando cadastro e invalidação |
| `tests/e2e/studio-measurement.spec.ts` | `1f8111b5e775b6fc8ded62671ce73c6075bf7de5` | `7d8eb37822bd2c6e0d6d76043c3f5fff492d309d` | Renomeia comando de visualização, mantendo testes de medição |
| `tests/e2e/ux-actions.spec.ts` | `40c47d0bcf61cf6d7e011eefad0c7bf0d3936311` | `e95dabbea2c3b1dd75e700ffb4d665710b1e9c94` | Confere canvas real no lugar de aba inexistente e preserva busca/pendências |

| `tests/e2e/integration-declared.spec.ts` | `3471934e847fe2f3b593191e9e0744b297c898e8` | `a2e8fd24b62fc0f7c3ad163b8dd62946c51511a0` | Abre explicitamente a vista 2D para conferir nós/IDs após validar visualização 3D do Studio; mantém as verificações do solver. |

A jornada `tests/e2e/journey-galpao.spec.ts` (criada após o snapshot histórico) também abre a vista 2D explícita, preservando o ensaio de vento, combinações, análise e resistência sem alterar o oráculo numérico.

## Escopo do aceite

1. Seletores obsoletos de abas e botões devem apontar para a interface real. Uma mudança em teste não é prova de funcionamento da interface.
2. O teste de resultado verifica agora canvas persistente, proteção de fabricação, quantitativos e acesso às pendências.
3. As análises espaciais continuam verificando invalidação de resultado obsoleto e PyNite; arquivos de cálculo, goldens e ensaios normativos não foram alterados neste registro.
4. O teste de tesoura do Tom seleciona explicitamente o exemplo 8×10 em vez da obra nova vazia; não altera expectativa numérica de compra/corte.
5. A exportação CAD de uma obra genérica deve permanecer funcional; a correção de produto está no commit `978bffb`.

**Condição obrigatória de integração:** CI completa verde no novo HEAD, incluindo E2E, validações Python/Windows/Linux e build. `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` permanecem bloqueados. Nenhum deploy de produção sem teste remoto integrado.

## Revisão pós-CI do PR #148 (falhas do HEAD f75390a)

- `src/components/planning/planning-editor.tsx`: projeto novo declarado é salvo e roteado **antes** de montar o 3D na tela de cadastro; modelo, validação e bloqueio de fabricação não mudaram.
- `tests/e2e/m35-irregular.spec.ts`: conserva o ensaio completo de geometria negativa, contorno, orçamento, suportes pendentes e segurança; URL recebe espera explícita de até 30 s.
- `tests/e2e/planning.spec.ts` e `tests/e2e/ux-actions.spec.ts`: pendências cadastrais são exibidas e corrigidas em **Verificação**, não na antiga aba Engenharia; todos os asserts das pendências e ações continuam.
- `tests/e2e/profiles-3d.spec.ts`: único seletor legado “Resultado” troca por “Materiais”; persistência de geometria e perfil segue obrigatória.
- `tests/e2e/quick-project.spec.ts`: prazo total do teste com WebGL, regeneração e reload passa para 90 s, sem excluir validações de sólidos, quantitativos ou persistência.

Blobs explicitamente revistos e fixados em `validation/integration-general/audit.py`:
- `tests/e2e/planning.spec.ts`: `42b0e9a79de1f9d4b07b20a2a3c564c8aca5ea23`
- `tests/e2e/profiles-3d.spec.ts`: `51a16f83c93441385db33db21e81f5dc639506e4`
- `tests/e2e/ux-actions.spec.ts`: `1f4e72cafb6b27a4aadf34545d9fb17e6d1210b6`
- `tests/e2e/quick-project.spec.ts`: `f780563e546b4e71f5f5b026e5b49288e74a7771`
- `tests/e2e/m35-irregular.spec.ts`: `ef9a670b15d50688af852db13d05e8c9e0bc4ad9`

Nenhum oráculo estrutural, aprovação, bloqueio de fabricação, regra de deploy ou arquivo de evidência histórico foi modificado. Merge condicionado à CI verde após este commit.
