# Campanha de validação do motor

Cada `cases/*.case.json` usa `jpn.validation-case/1` e aponta para um projeto
JPN completo salvo ao lado (`*.project.json`), incluindo geometria, revisões,
materiais, vínculos, cargas e convenção C1 declarados. Não recriar geometria ou
atualizar revisões automaticamente no runner.

O exemplo é um balanço sintético de 1 m em primeira ordem. Suas cinco
referências são soluções analíticas de equilíbrio e Euler-Bernoulli, calculadas
antes da execução e documentadas no próprio caso. Não representa uma obra real,
aprovação normativa ou validação concluída da segunda ordem.

Para adicionar referências do Claude ou de projetos reais, copiar o formato,
substituir o projeto completo e preencher referência, hipótese, revisor, estado
de revisão, valores esperados em SI, unidade e tolerâncias justificadas. Usar
`example-unreviewed` enquanto faltar revisão independente. Nunca preencher
esperados automaticamente a partir do motor que se pretende validar.

Cada quantidade usa JSON Pointer RFC 6901 relativo à resposta do motor.
Critério: `|calculado - esperado| <= absoluta + relativa * |esperado|`.
Não há conversão de unidades implícita. Quantidades ausentes/não numéricas,
casos vazios, arquivos inválidos e recusas do motor falham; não viram zero nem
sucesso parcial. As tolerâncias não são alteradas durante a execução.

Executar a campanha, com as dependências Python reais já instaladas:

```text
# JPN_PYTHON_EXECUTABLE aponta para Python 3.12 com dependências do engine
npx vitest run src/infrastructure/analysis/validation-campaign.test.ts
```

O runner reutiliza preparação, validação de SHA e workers limitados existentes,
tanto para `linear` como `second-order`. Cada caso gera evidência ignorada pelo
Git em `.tools/validation-campaign/`, com hashes do caso/projeto/entrada do motor,
solver, referência, diferenças e tolerâncias. A suíte existente da CI descobre
automaticamente os casos; o artefato `general-integration-browser-evidence`
preserva as evidências. Sucesso numérico não concede revisão profissional,
aprovação estrutural ou fabricação; os três bloqueios permanecem travados.

Pendências: referências independentes revisadas do Claude, obras reais e casos
de segunda ordem fornecidos/revisados. O suporte do runner a essa ordem não é
evidência de uma campanha espacial já executada.
