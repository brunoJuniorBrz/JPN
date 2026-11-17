# Padrões de interface (F0)

Base para as fases F1 a F6 do [PLANO-UI.md](PLANO-UI.md). Decisões e motivos ficam em [DECISOES.md](DECISOES.md).

## Tokens (`src/app/globals.css`, `:root`)

- **Cor:** `--color-bg`, `--color-surface`, `--color-surface-muted`, `--color-surface-hover`, `--color-ink`, `--color-muted`, `--color-subtle`, `--color-line`, `--color-line-strong`, `--color-accent`, `--color-accent-strong`, `--color-accent-soft`, `--color-dark`, `--color-on-dark`, além dos pares de estado `success`, `warning` e `danger` (`-soft` e `-line`).
- **Espaço:** `--space-1` (4px) a `--space-10` (40px), em passos de 4.
- **Raio:** `--radius-sm` (4px), `--radius-md` (7px), `--radius-lg` (11px), `--radius-full`.
- **Tipografia:**
  - famílias: `--font-sans` (Inter via `next/font`) e `--font-mono`;
  - tamanhos: `--text-2xs` (10px) a `--text-xl` (19px);
  - pesos: `--weight-*`.
- **Outros:** `--shadow-sm/md/lg`, `--focus-ring`, `--hit-target` (44px) e camadas `--z-sticky/overlay/popover/toast`.
- **Variáveis antigas** (`--ink`, `--gold`, `--line`…) continuam valendo como apelidos. Código novo usa os nomes `--color-*`.

## Componentes (`src/components/ui/`)

Importe um por arquivo, por exemplo `@/components/ui/button`. O caminho `@/components/ui` continua apontando para o `ui.tsx` antigo (Field, Input, Select, PageHeading, Status). Os estilos ficam em `src/app/ui-primitives.css`, com o prefixo `ui-`.

| Componente | Uso | Regra de acessibilidade |
|---|---|---|
| `Button` | ação com texto; `variant` primary/secondary/ghost/danger; `size` sm/md; `asChild` para Link | `type="button"` por padrão; alvo de 44px (36px no `sm`) |
| `IconButton` | ação só com ícone | `label` obrigatório: vira o `aria-label` e a dica |
| `Tabs` | troca de seções no mesmo lugar | setas entre as abas; dê `aria-label` ao `TabsList` |
| `Menu` | menu suspenso de ações | setas, Home/End, busca por letra; Esc devolve o foco |
| `ContextMenu` | clique direito, toque longo, Shift+F10 ou tecla Menu | toda ação dele existe também num lugar visível |
| `Dialog` | confirmação ou painel modal | `title` obrigatório; foco preso; Esc fecha |
| `Sheet` | painel lateral (`right`/`left`) ou inferior (`bottom`, celular) | igual ao Dialog |
| `Tooltip` | dica curta em hover e foco | nunca é o único lugar de informação essencial (no toque a dica não aparece) |
| `Badge` | estado curto (`tone` neutral/accent/success/warning/danger) | o texto diz o estado; a cor só reforça |
| `Kbd` | tecla ou atalho (`keys={["Ctrl","K"]}`) | sem regra extra |

## Regras de uso

- **Avisos de segurança e limitações.** Podem mudar de lugar (painel de pendências, dica), mas precisam continuar acessíveis por teclado e leitor de tela. "Bloqueado para fabricação" usa `Badge tone="danger"` e fica sempre visível.
- **Foco.** Foco visível sempre: `--focus-ring`, nunca `outline: none` sem substituto.
- **Celular.** Testar em 390px. No celular, Sheet usa `side="bottom"`. Alvos de toque com no mínimo 44px.
- **Testes e2e.** Não renomear nomes acessíveis nem `data-testid` existentes ao trocar um componente antigo por um novo.
