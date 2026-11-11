# M40-P1 — Cargas e reações vinculadas aos apoios físicos

**Estado:** PR #72 draft; revisão numérica e testes completos em andamento. **Não é validação normativa nem liberação estrutural.**

## Cadeia física única

O fluxo usado por este marco é:

1. Contorno dos panos em XYZ e recortes, cadastrados com fonte/revisão no M37.
2. Células tributárias e terças reais divididas nos trechos efetivos, calculadas no M39.
3. Requisição `jpn.mixed3d/2`, hash SHA-256 e respostas do PyNite real.
4. Carregamentos e momento resultante reconstituídos por combinação sem depender do campo de equilíbrio apresentado pelo solver.
5. Forças e momentos de reação retirados dos nós do PyNite, vinculados às interfaces reais declaradas do M36 (coluna metálica nova, concreto ou alvenaria existente, fundação ou outro suporte físico).
6. Relatório `jpn.resistance-report/2` recebe a auditoria quando há geometria declarada com cargas. Sua liberação continua `NOT_READY_BLOCKED`.

Os controles ignoram qualquer texto que alegue aprovação estrutural. **A reconstituição da distribuição das cargas é executada novamente** a partir dos panos atuais: o módulo não confia em resultantes de uma solicitação antiga.

## Equações independentes

Para qualquer combinação linear com fatores `γ_case` explicitamente declarados:

- Carga nodal: `F = γ_case * (Fx,Fy,Fz)`, `M = γ_case * (Mx,My,Mz) + r × F`.
- Carga linear **global** constante em uma barra: `F = γ_case * q_global * L`, `M = r_centro × F`.
- Peso próprio com densidade/massa e gravidade explicitamente declaradas: `F = γ_case * ρ * A * L * g`, `M = r_centro × F`. Não inventa densidade ou peso de perfil.
- Apoio: `R = reaction_force_n`, `M_apoio = reaction_moment_nm + r_apoio × R`.

Conservação:
`Σ(F_externas + R_apoios) = 0` e
`Σ(M_externos + M_apoios) = 0`,
ambas em **N** e **N·m**, no mesmo referencial global XYZ. Tolerância relativa `1e-7` aplicada à escala das resultantes; divergências são erros, não avisos ignorados.

Este marco não converte automaticamente carregamentos locais das barras para o referencial global: se existirem, bloqueia a auditoria até uma transformação orientacional independente.

## Exemplo de validação

Cobertura em L, projeção de **18 m²**, ação declarada **0,20 kN/m²** para baixo, resultante externa **−3.600 N**. Os esforços são efetivamente encaminhados às terças, barras conectadas e apoios; o teste lê as reações **reais** produzidas pelo PyNite, verifica a soma de +3.600 N em Z e o equilíbrio dos três momentos globais.

Ensaios adversariais obrigatórios: adulteração de reação, adulteração do vetor de distribuição, mudanças na revisão geométrica, falta de interface física, alteração de DOFs e perda de trecho na discretização. Não é permitido ajustar o limiar de estabilidade do solver para fazer o teste passar.

## Limitações de segurança

- Identificar uma reação **não prova** que uma parede de alvenaria ou concreto existente consegue resistir ao esforço.
- Comparações com capacidades declaradas são preliminares: o próprio sistema não calcula aqui resistência de base, ligação, chumbador, parede ou fundação.
- Não há nesta entrega revisão normativa de ações e combinações, vento completo, ELU/ELS de barras, flambagem, segundo-ordem, dimensionamento de ligações e fixações, aprovação profissional e ART aplicável.
- `computedStructuralApproval=false`, `fabricationRelease=false` e `releaseGate=NOT_READY_BLOCKED` permanecem invariantes.

**Aceite:** TypeScript, lint, testes unitários com PyNite real, cálculos analíticos independentes, E2E de persistência, build, DXF e perfis Python Linux/Windows aprovados no SHA do PR; depois revisão técnica especializada.
