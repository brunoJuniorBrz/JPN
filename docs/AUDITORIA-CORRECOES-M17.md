# Auditoria pós-correções do PR #18 — relatório de execução limitada

Data: 2026-10-31. Branch: `feat/explicit-selfweight-distributed-mixed3d`. Base: `main` após Missão 16. **Não é aprovação normativa. Sem merge ou deploy para produção.**

## Escopo de alterações corretivas

1. `src/components/planning/structural-loads-panel.tsx`: fonte/revisão próprias para ações por área (não reutiliza mais os dados de UDL); nova revisão explícita de possível repetição de peso próprio.
2. `src/domain/structural-loading.ts`: metadados opcionais de revisão de duplicidade, detecção de combinações que somam peso automático e outras cargas manuais e representação canônica do conjunto conferido.
3. `src/domain/loaded-mixed-adapter.ts`: bloqueia execução com `POSSIBLE_DOUBLE_COUNT` quando há combinação simultânea e confirmação ausente/obsoleta.
4. `src/domain/examples/loaded-mixed-project.ts`: confirmação explícita somente para as cargas artificiais independentes do exemplo, sem copiar hipóteses à obra do usuário.
5. `src/domain/loaded-mixed.test.ts`: testes novos para revisão ausente, invalidação após mudanças de carregamento/combinação/densidade, isolamento de casos; teste adicional com geometria gerada via `createQuickProject`, preparação física explícita e chamada real ao worker Python.
6. `tests/e2e/loaded-mixed.spec.ts`: testes novos para revisão obrigatória, nova confirmação, proveniência da área e bloqueio `ROOF_LOAD_PATH_PENDING`.

### Limite honesto da proteção

**Não é possível inferir que duas cargas de valores iguais são fisicamente duplicadas.** A correção exige declaração humana rastreável para combinações com peso próprio automático e outras ações manuais e invalida-a quando mudam geometria declarada, propriedades de grupos, casos, carregamentos ou fatores. A proteção é no adaptador de obra JPN. Não é uma detecção automática universal no solver Python; integrações externas que geram JSON diretamente continuam responsáveis por classificar ações corretamente.

## Auditoria de conteúdo e matemática efetuada fora do Codex

- Confirmado por comparação direta de conteúdo que os cinco arquivos protegidos (`cutting.ts`, `structure.ts`, `structure.ts` do domínio, `cad.ts`, `solver.py`) permanecem idênticos à `main`.
- Recalculada diretamente a massa do JSON `engine/examples/mixed-loaded-roof.json` com `m = Σρ A L`, sem empregar o motor: **4556.486694873053 kg** para 243 segmentos/243 densidades, diferença zero para o total arquivado. Gravidade [0,0,-10] m/s² => peso [0,0,-45564.866948730574] N.
- Executados 11 cálculos aritméticos independentes da formulação de vigas e exemplo de peso, sem PyNite/JPN: 11/11 consistentes com as fórmulas fechadas e os valores publicados. Isso verifica a aritmética e os dados registrados, **não a execução do motor**.
- Comparados arquivos retornados do GitHub no commit do PR após edição; alterações estão na branch draft, não na main.

## NÃO VERIFICADO / BLOQUEIOS

Não foi possível executar no ambiente do auditor o checkout do repositório e as suítes exigidas, porque o acesso Git direto é bloqueado, não há Python 3.12/PyNiteFEA 3.2.1 nem Node 24/pnpm instalados. **Os novos testes não foram executados pelo auditor.** As contagens originais 1425 Python, 172 Vitest e 56 Playwright são registros do Codex anteriores às correções, não aprovação da versão atual.

GitHub Actions reportava `failure` com **zero etapas executadas** nos jobs application/Ubuntu/Windows. Logs do job retornaram 404 BlobNotFound. Causa não determinada: pode envolver infraestrutura/permissões/conta e não foi atribuída ao código.

Vercel/Linux/Windows integrados, DXF regenerado e fluxo manual completo via UI em obra comum continuam não homologados independentemente. O teste novo de cobertura gerada normaliza parte da lacuna, mas seu resultado não pode ser antecipado antes da execução.

Os arquivos locais `.tools/m17-*` não constam do diff da PR; seus bytes locais não foram inspecionados.

## Comandos de reprodução **no checkout exato da branch**

Antes de rodar, instalar Node 24, pnpm conforme packageManager, Python 3.12 e dependências do engine (usar lockfile versionado) e apontar `JPN_PYTHON_EXECUTABLE` para o Python 3.12.

```powershell
git fetch origin
git switch feat/explicit-selfweight-distributed-mixed3d
git pull --ff-only
py -3.12 -m pip install -e "./engine[validation]"
$env:JPN_PYTHON_EXECUTABLE = (py -3.12 -c "import sys; print(sys.executable)")
py -3.12 engine/validate.py --output-dir engine/validation-results
py -3.12 engine/audit_loading.py
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm build
git diff origin/main...HEAD -- src/domain/calculations/cutting.ts src/domain/calculations/structure.ts src/domain/structure.ts src/lib/exports/cad.ts engine/jpn_structural/solver.py
```

Este conjunto é um **roteiro pendente**, não uma lista de comandos executados neste ambiente.

## Veredito

**Código corretivo escrito e confirmado no GitHub; integração definitiva NÃO APROVADA NESTA AUDITORIA.** Antes do merge: executar realmente as suítes atualizadas, investigar CI de zero steps, verificar DXF/backup/rotas e demonstrar fluxo da geometria criada normalmente no JPN. O motor segue experimental, sem vento automático ou dimensionamento resistente normativo e sem autorização de fabricação.
