# INT-2 · execução assíncrona

No projeto frontend, exponha as variáveis de sistema da Vercel, configure
`JPN_ANALYSIS_ASYNC_ENABLED=1` e defina `JPN_ANALYSIS_JOB_KEY` com um segredo
aleatório exclusivo de pelo menos 32 caracteres. A autenticação de operador
e o token servidor → Python continuam separados. O projeto Python e o
frontend precisam de Fluid Compute. No deploy atual (Vercel Hobby,
maxDuration=300 s), o worker enfileirado é limitado a 270 s, e o cliente
aguarda no máximo 285 s. O perfil síncrono do Python mantém 20 s.
O perfil longo original de até 740 s **não está disponível neste plano**;
para retomá-lo é necessária infraestrutura com duração suficiente
(ex.: Vercel Pro/Enterprise, após revisar maxDuration, limites e testes),
ou um executor assíncrono externo. Large Functions (beta) permite o
pacote de dependências, mas não aumenta o limite de duração.

Use `Prefer: respond-async` no POST autenticado de mixed3d, design, section
ou structural-assessment. Quando habilitado, mixed3d /3 de segunda ordem
entra na fila mesmo sem a preferência. O HTTP 202 contém `status_url`,
`request_sha256` e `Retry-After`. Guarde a URL e consulte-a com o mesmo
login. Os estados são `pending`, `running`, `ready` e `error`. Em `ready`,
consulte `result_url` para receber o contrato original e conferir
`X-JPN-Request-Sha256` e os hashes do modelo. Respostas acima de 2 MB
requerem `Accept-Encoding: gzip`; o teto descomprimido é 16 MB.

O Workflow mantém os dados do trabalho entre requisições. O perfil longo
usa a mesma execução isolada e verificadores de resultado. Se o trabalho
for recusado, o estado de erro conserva o código e, quando houver, o ID
da combinação. Os prazos e limites de saída resultam em recusa explícita.
