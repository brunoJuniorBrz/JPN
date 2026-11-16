# Extrato normativo privado: como os Cpe de cobertura chegam à Vercel

Escrito em 16/11/2026 (análise da main `f9771d6` + N1/N2).

## Situação atual: não chegam

- O extrato (`m33a-reviewed-extract.json`) só é lido por `loadNormativeOriginFiles`, a partir de
  `JPN_NORMATIVE_DATA_DIR`, uma pasta local fora do Git.
- Na main, essa função só é chamada em testes. Nenhuma rota da API nem tela usa o extrato.
- Na Vercel não há pasta privada nem variável configurada para isso.

**Consequência: online, o vento da cobertura revisada (Tabelas 7 e 8; 45°/30° e, com o N2, 10°/15°)
fica BLOQUEADO.** O vento nas paredes (Tabela 6) funciona online porque os valores dele estão no
JSON público `data/normas/nbr6123-2023-wall-cpe.json`.

## Proposta, se o extrato continuar privado

O projeto já usa um Vercel Blob **privado** para os projetos (`blob-project-store.ts`, `access: "private"`,
`BLOB_READ_WRITE_TOKEN`):

1. Gravar o extrato no mesmo store, em `normative/m33a-reviewed-extract.json`, feito à mão pelo dono
   e nunca pela aplicação.
2. Configurar na Vercel a variável `JPN_NORMATIVE_EXTRACT_SHA256` com o SHA-256 do arquivo aprovado.
3. Uma rota de servidor lê o blob, calcula o SHA-256 dos bytes e só usa o conteúdo se o SHA conferir.
   Se o arquivo faltar ou o SHA divergir, a análise é bloqueada sem fallback (`NORMATIVE_PRIVATE_EXTRACT_SHA_MISMATCH`).
4. O SHA conferido vai para o registro da análise. Os valores nunca são devolvidos ao navegador, só os carregamentos resultantes.

## Incoerência a decidir

Hoje o repositório tem os dois modelos ao mesmo tempo:
- **valores públicos:** Tabela 6 inteira no JSON de paredes; as 20 células de 10°/15° no
  `docs/N2-CPE-COBERTURA-GALPAO.md` e no teste `reviewed-roof-shed-slopes.test.ts` (PR #130);
- **extrato privado:** a cobertura de 45°/30° e as mesmas linhas de 10°/15° no fluxo real.

### Opção A: tabelas privadas (manter o extrato)
- Tirar os valores do doc e do teste do N2. O teste passa a usar valores sintéticos, e a conferência célula a célula vai
  para `validation/m33a/private-validation.test.ts`, que roda só com o extrato licenciado.
- Implementar a leitura do Blob privado com SHA conferido (proposta acima).
- Por coerência, mover também a Tabela 6 para o extrato (hoje é pública).
- Custo: a conferência de valores não roda no CI público e o vento da cobertura depende de configuração online.

### Opção B: tabelas no Git (dispensar o extrato para Cpe)
- Publicar as linhas usadas das Tabelas 7 e 8 num JSON versionado, como já é feito com a Tabela 6,
  e retirar `gable*`/`mono*` do extrato.
- O extrato fica só para o que ainda é privado (fatores da 8681, até o N3) ou deixa de existir.
- Custo: depende de a licença da ABNT permitir publicar esses trechos. Essa pendência já está registrada no
  aviso PROVISIONAL do vento.

Não é decisão técnica: é sobre a licença da norma. Até a decisão, o PR #130 continua com
os valores no doc e no teste.
