# INT-2 / etapa 4 — contas e projetos salvos no servidor (decisão do dono pendente)

Estado: o **contrato** está pronto e testado (`src/domain/server-projects.ts`); falta escolher **login** e **banco**.
Nada foi criado fora do repositório: nenhuma conta, nenhum serviço, nenhum segredo.

## O que já está implementado (independe da escolha)
- `ServerProjectRecord`: projeto + dono + **versão** (1, 2, 3…, nunca sobrescrita) + `parentVersion` + `payloadSha256` (hash canônico, floats em bits).
- `ProjectStore` (porta): `list`, `get`, `history`, `save(expectedVersion)`. Versão desatualizada = `VERSION_CONFLICT`; outro usuário = `FORBIDDEN`/`NOT_FOUND`.
- `migrateLocalProjects`: sobe os projetos do navegador sem tocar em nenhum valor; idempotente; conteúdo diferente no servidor só é reportado.
  Teste prova: mesmo JSON, mesmo hash e **todos os números iguais bit a bit**, inclusive após ida e volta (JSON/HTTP).
- `reconcileCache`: localStorage vira cache; servidor vence sem edição pendente; edição pendente sobre versão antiga é **conflito explícito**.
- `InMemoryProjectStore`: implementação de referência; um adaptador real deve passar os mesmos testes.

## O que falta e precisa da sua decisão
| Decisão | Opção recomendada (mais simples, gratuita, compatível com a Vercel) | Alternativas |
|---|---|---|
| Login + banco | **Supabase** (Auth + Postgres com Row Level Security num serviço só, plano gratuito; e-mail com link mágico ou senha) | **Neon** (Postgres, Marketplace da Vercel) + **Auth.js** (precisa de provedor de e-mail ou OAuth, ex.: GitHub/Google); **Clerk** (login pronto, plano gratuito) + Neon |
| Modo sem contas | Reaproveitar o operador único já existente (`JPN_MIXED_ACCESS_USER`) como `ownerId`, só com um banco | — |

Por que Supabase: um único serviço entrega login e banco, a isolação por usuário fica no banco (RLS) e o adaptador do `ProjectStore` é pequeno.
Contras a conhecer: projetos gratuitos podem ser **pausados por inatividade**, há limite de tamanho/e-mails por hora e o plano muda com o tempo
— confira os limites vigentes antes de decidir. Se quiser evitar um provedor de login externo agora, o modo "operador único" cobre o uso atual.

### Esquema proposto (Postgres)
```sql
create table project_versions (
  owner_id uuid not null references auth.users(id),
  project_id uuid not null,
  version int not null check (version >= 1),
  parent_version int,
  saved_at timestamptz not null default now(),
  payload_sha256 text not null check (length(payload_sha256) = 64),
  snapshot_version int not null,
  payload jsonb not null,
  primary key (owner_id, project_id, version)
);
alter table project_versions enable row level security;
create policy own_rows on project_versions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```
`jsonb` normaliza ordem de chaves e a representação de números; por isso o adaptador deve gravar o JSON **exato** em coluna `text`/`json`
(ou conferir `payloadSha256` na leitura, como `migrateLocalProjects` já faz) para manter os números idênticos.

### O que você configura na Vercel (depois de decidir; nada disso foi feito)
| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto (pública) |
| `SUPABASE_ANON_KEY` | chave anônima (pública, protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sensitive**, só no servidor; nunca no navegador |

(Com Neon + Auth.js: `DATABASE_URL` Sensitive, `AUTH_SECRET` Sensitive e as credenciais do provedor de login.)

## Próximos passos após a sua decisão
1. Adaptador `ProjectStore` do provedor escolhido, passando os mesmos testes do `InMemoryProjectStore`.
2. Rotas `/api/projects` (list/get/save com `expectedVersion`), autenticadas.
3. `DataProvider`: carregar do servidor, localStorage como cache (`reconcileCache`), tela de conflito, botão "enviar projetos deste navegador" (`migrateLocalProjects`).
4. E2E: criar projeto, recarregar em outro contexto, conflito de versão.

`computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` não são tocados por esta etapa.
