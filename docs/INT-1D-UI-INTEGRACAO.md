# INT-1d / INT-1e — integração na interface (base: #113)

Jornada única, só pela UI: cadastro → geometria → apoios → cargas → fachadas/vento NBR 6123 → combinações NBR 8681 →
giros revisados → análise `jpn.mixed3d/3` (PyNite) → resistência + avaliação M50/M51 → norma por peça → relatório.

## O que entrou
- Editor de fachadas físicas e de tração declarada (persistidos no projeto; exportam/restauram).
- Botão **Vento NBR 6123 nas paredes** (`buildNormativeFacadeTraction`) — casos `VENTOPX/NX/PY/NY`.
- Botão **Gerar combinações NBR 8681** (`applyNbr8681Combinations`), fonte = JSON do #99; não apaga o extrato SHA da main.
- `execute()` chama `/api/experimental/structural-assessment` depois de `buildResistanceReport` e mostra o resultado.
- Norma por peça (NBR 14762 × NBR 8800) com matriz peça × combinação ELU; rota local `/api/experimental/steel-design`
  (`jpn.steel-i-design/1`). Dado ausente = `unsupported`; nunca PASS, nunca aprovação.
- A escolha da norma (`spatialPreparation.resistanceStandards`) não entra no hash da análise nem na identidade da UI.

## PROVISÓRIO (divergências normativas adiadas, não bloqueiam)
Gravado em `spatialPreparation.normativeProvenance`, mostrado na UI e no relatório (`normativeStatus`, `normativeNotices`):
- NBR 8681: fonte única das tabelas ainda não unificada.
- NBR 6123: edição única ainda não fechada.
- Licenciamento das tabelas.

## Limitações conhecidas
- Avaliação M50/M51: com muitas combinações (~60, modo ações conjuntas) a resposta integrada passa de 2 MB →
  "Avaliação indisponível: OUTPUT_LIMIT" visível na tela (não some em silêncio).
- Perfil laminado em NBR 8800 exige propriedades e raio declarados: bloqueado com motivo.
- Fora de escopo: segunda ordem (M43), rota remota de dimensionamento/avaliação, persistência no servidor.

## Testes
- Vitest: `facade-declaration.test.ts`, `steel-i-member-requests.test.ts`.
- E2E (portão): `tests/e2e/journey-galpao.spec.ts`, 390 px e 1440 px, sem `page.request`.
- M50: `bending-shear-9.8.4` passou de BLOCKED para CONDITIONAL (vitest e e2e).
