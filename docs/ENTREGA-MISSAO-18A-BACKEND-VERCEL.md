# Missão 18A — entrada Python e HTTP misto autenticado

Base exata: PR #18, **91efa3db0bd6a6547afc06d4bbe3bbdcd9f0268a**. Branch `fix/vercel-python-mixed-entrypoint`, empilhada sobre `feat/explicit-selfweight-distributed-mixed3d` enquanto o PR #18 estiver aberto. Nenhuma alteração em main, interface, contratos numéricos, matemática, orçamento ou exportações. Nenhum projeto criado, configuração de painel modificada, deploy manual ou promoção realizados.

## Causa observada e correção

Consulta somente leitura ao projeto existente `jpn-structural-engine` confirmou preset `python` e deployment **dpl_CjZeubJr3gEBLC46sBy7B3ZT9BSp** em ERROR, código `PYTHON_ENTRYPOINT_NOT_FOUND`. Esse deployment tinha origem Git em `4b948ada1103de4ac05ea75136f1a16daad8678f`, não no commit-base solicitado. A mensagem dizia que só havia localizado `jpn_structural/service.py (variable: Handler)`. A configuração completa de Root Directory não é exposta pelo resultado normalizado do conector; **Root Directory esperado é `engine`** e deve ser conferido antes da publicação separada.

A base solicitada também não possui uma entrada WSGI padrão. O antigo Handler é transporte dos motores anteriores, não o serviço misto. Não apontamos a sugestão automática para ele nem copiamos cegamente o PR #13.

Criado **`engine/app.py`, callable WSGI `app(environ, start_response)`**, explicitamente selecionado por `[tool.vercel] entrypoint = "app:app"`. A [documentação oficial do runtime Python](https://vercel.com/docs/functions/runtimes/python#python-entrypoints) prevê essa localização e configuração. `engine/vercel.json` mantém preset Python, duração externa 30 s e exclusões de testes/exemplos/artefatos, mantendo o worker no bundle. `.python-version=3.12` reforça o intervalo já existente `>=3.12,<3.13`.

Dependências matemáticas não foram alteradas: NumPy 2.5.4, SciPy 1.18.1 e **PyNiteFEA 3.2.1**. Nenhum Flask/FastAPI ou outra dependência foi acrescentado. Importar a entrada não importa NumPy/Pynite no processo HTTP; isso foi verificado em interpretador novo a partir do diretório engine.

Do PR #13 foram reaproveitados os princípios de Bearer server-side, falha fechada sem configuração, envelope com hash do corpo, limite de duração e exclusões de bundle. Seus endpoints 2D/frame3d e health de mera presença de token não foram integrados.

## Endpoints e segurança

Ambos exigem **`Authorization: Bearer <JPN_ANALYSIS_TOKEN>`**, inclusive health. Sem segredo configurado: 503 CONFIGURATION; token ausente/incorreto: 401, antes de ler o corpo ou iniciar worker. O segredo fica no ambiente do servidor, não em URL/browser. Respostas são JSON/no-store, sem CORS permissivo e sem logging de corpo/credenciais.

- **GET `/health`**: inicia o worker real protegido, importa dependências reais e confirma Python 3.12/PyNiteFEA 3.2.1 e limite de memória. Retorna contratos aceitos e limites. Não declara readiness apenas pela presença do token.
- **POST `/api/analyze-mixed`**: `Content-Type: application/json`, Content-Length entre 1 e 500000 bytes, corpo estrito `jpn.mixed3d/1` ou `/2`. Recusa duplicação de chaves, NaN/Infinity/overflow, contratos desconhecidos, modelos incompletos/instáveis e qualquer erro do solver. Não aceita implicitamente `jpn.frame3d/1` ou o contrato 2D.

O corpo original, sem normalização, segue ao **mesmo `local_mixed_worker.py` já existente**. Não há duplicação da matemática e esse worker não foi modificado. Ele mantém a validação numérica, dispatch v1/v2, hash canônico, equilíbrio e limite OS antes de importar NumPy/SciPy/Pynite.

Envelope HTTP de sucesso:

```json
{
  "schema_version": "jpn.http-mixed/1",
  "request_sha256": "sha256 dos bytes originais do corpo",
  "result": { "schema_version": "jpn.mixed3d-result/1 ou /2", "input_sha256": "hash canônico do solver" },
  "execution": { "isolation": "subprocess", "timeout_seconds": 20, "memory_limit_bytes": 805306368, "memory_kind": "dependente do SO", "concurrency_per_instance": 1 }
}
```

O exemplo acima é somente um esquema ilustrativo, não resultado de análise. O resultado completo é o contrato original do solver. Os dois hashes não precisam ser iguais: um refere os bytes HTTP, outro a representação canônica. Os testes conferem ambos. O sinalizador local-only do transporte anterior não é exportado como se descrevesse o serviço HTTP remoto; somente os limites efetivamente confirmados são publicados.

Um subprocesso por instância. Timeout de **20 s**, espera limitada de encerramento e vaga liberada somente após término; falha de limpeza desabilita novas execuções nessa instância. stdin é enviado em thread para não impedir timeout; stdout é limitado **durante a leitura** a 2000000 bytes, stderr a 16000, com interrupção efetiva do filho. O envelope HTTP final também respeita 2 MB. Erros nunca contêm resultado parcial.

Memória do worker: **768 MiB**, Job Object Windows ou RLIMIT_AS Linux. O limite se aplica ao processo numérico, não é declaração sobre RSS/memória global da plataforma. Ambiente sem limite verificável falha fechado. A concorrência é **por instância**, não uma cota distribuída entre instâncias Vercel. A proteção SSO de previews do projeto é uma camada separada do Bearer; não foi removida nem contornada nesta missão.

## Testes e configuração

Testes novos percorrem HTTP real → WSGI → subprocesso Python real → PyNite:

- Health e autenticação, incluindo falha sem segredo antes de ler/iniciar cálculo.
- Misto v1 comparado com fórmula independente de balanço+mola axial em paralelo, com hash bruto e canônico.
- Misto v2 com carga uniforme e peso: massa **21 kg**, reação total vertical **210 N**, flecha independente por qL⁴/(8EI)+PL³/(3EI), estações internas e equilíbrio.
- Modelos instáveis e JSON inválido não retornam resultado.
- Limites de tamanho/método/tipo/origem de contrato; fila cheia e falha de limpeza.
- Processos reais de ensaio interrompidos por timeout (deadline reduzido a 1 s somente no teste), stdout excessivo e stderr excessivo. Esses ensaios de transporte não substituem os cálculos reais acima.

| Comando/checagem | Resultado |
| --- | --- |
| `python -m pytest engine/tests/test_vercel_mixed_http.py -q` | **16 aprovados**, 0 falhas; 5,73 s na execução direcionada final |
| `python engine/validate.py --output-dir docs/validation/mission18a/python` | **1441 aprovados**, 0 falhas/erros/skips; mais campanha de **1000 comparações** e benchmarks herdados aprovados; 59,86 s |
| `python -m compileall -q engine` | Aprovado, 0 erros de sintaxe |
| `python -m pip check` | Aprovado, dependências consistentes |
| Entrada a partir de engine em processo novo `python -I` | Aprovado; callable correto, sem importações numéricas antecipadas |
| Configuração estática | Campos/preset/maxDuration/exclusões conferidos contra o [schema oficial](https://openapi.vercel.sh/vercel.json); caminho app.py e worker existentes; orçamento interno de timeout inferior a 30 s |
| Build Linux/Vercel e HTTP remoto | **Não executados**: publicação/validação remota reservadas pelo usuário para etapa separada |
| Frontend/TS/Playwright | Não executados nesta etapa; nenhum arquivo de frontend alterado |

Não houve falha nos testes novos executados. A evidência não equivale a um build Vercel homologado: só foi comprovada a correção da descoberta de entrada e execução HTTP local no Windows, com Python 3.12.10/dependências reais. A próxima publicação pode revelar outros problemas de instalação/bundle/runtime Linux, que devem ser registrados sem repetição cega de deploy.

## Próxima validação separada

Usar o **mesmo projeto** `jpn-structural-engine`, Root Directory `engine`, preset Python, sem override antigo de build/output/install que selecione outro app. Configurar `JPN_ANALYSIS_TOKEN` server-side. Não usar entrada `jpn_structural.service:Handler`. Confirmar Python 3.12, inclusão de `app.py`, `local_mixed_worker.py` e `jpn_structural/` e ausência de exclusão externa desses arquivos.

Após a publicação autorizada separadamente: autenticar GET `/health`; testar POST `/api/analyze-mixed` com `engine/examples/mixed-adapted-roof.json` e `mixed-loaded-roof.json`; conferir hashes, solver, peso, deslocamentos e equilíbrio contra as referências locais. Requisição sem Bearer deve falhar; se houver SSO Vercel, resolver essa proteção separadamente sem remover a autenticação do motor. Nenhuma chamada HTTP a um deployment remoto foi efetuada aqui.

Serviço experimental: sem aprovação normativa ou liberação de fabricação. Nenhuma integração frontend faz parte desta entrega.
