# C1 — Eixos locais Z-up e contrato `jpn.mixed3d/3`

Origem: auditoria independente de 12/11/2026 sobre a `main` em `1a7002b`. Entrega experimental; `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` permanecem.

## Diagnóstico confirmado

`Pynite/Member3D.py::T()` (PyNite 3.2.1) monta a base local para um mundo com **Y vertical**, em três ramos escolhidos por `isclose` nas coordenadas: barra paralela a Y, barra com `Yi = Yj`, e as demais. O JPN usa **Z vertical**. Com o mesmo perfil e o mesmo giro declarado, a orientação física da seção dependia da direção global da barra.

Referências independentes usadas (nenhuma usa a base do PyNite nem a do JPN):

1. **Solução fechada de Euler-Bernoulli** para balanço com força de ponta e carga uniforme, decomposta nos eixos principais declarados: `u = Σ_k [(F·e_k)L³/(3EI_k) + (q·e_k)L⁴/(8EI_k)] e_k` mais o termo axial. Deslocamento ao longo de `e_y` usa `Iz`; ao longo de `e_z` usa `Iy`.
2. **Viga biapoiada**: `5 q L⁴ / (384 E I)` com a componente da carga normal ao eixo.
3. **Objetividade**: girar estrutura e cargas em torno de Z deve apenas girar a resposta.
4. **Inversão de extremidades**: a mesma seção física vista da outra ponta deve dar a mesma resposta.

Viga biapoiada de 6 m, 100 N/m, `Iy = 8e-6`, `Iz = 1e-6 m⁴`, giro 0 (`validation/c1-local-axes/evidence.json`):

| Planta | Desnível | `/2` hoje: vertical / lateral (mm) | `/3`: vertical / lateral (mm) | Fechada com Iy (mm) |
|---|---|---|---|---|
| 0° | 0,6 m | −1,0652 / 0 | −1,0652 / 0 | −1,0652 |
| 30° | 0,6 m | −1,0898 / 0,4291 | −1,0652 / 0 | −1,0652 |
| 90° | 0 | −1,0547 / 0 | −1,0547 / 0 | −1,0547 |
| 90° | 0,06 mm | −8,4375 / 0 | −1,0547 / 0 | −1,0547 |
| 90° | 0,6 m | −8,5219 / 0 | −1,0652 / 0 | −1,0652 |
| 135° | 0,6 m | −1,1383 / 0,7384 | −1,0652 / 0 | −1,0652 |
| 270° | 0,6 m | −8,5219 / 0 | −1,0652 / 0 | −1,0652 |

## Convenção `jpn-z-up/1`

- `x`: início → fim.
- `y_ref = (ez × x)/|ez × x|`: horizontal.
- `z_ref = x × y_ref`: no plano vertical da barra, para cima.
- Barra exatamente vertical: `y_ref = +Y global`.
- Giro declarado: rotação pela mão direita de `(y_ref, z_ref)` em torno de `x`.
- Giro 0 significa: `Iy` resiste a cargas no plano vertical da barra.
- Inverter as extremidades de uma barra não vertical mantém `z_ref` e inverte `y_ref`: a seção física não muda. Visto da outra ponta, o giro troca de sinal.
- Barra a menos de 1° da vertical, mas não exatamente vertical, é recusada com `AXIS_REFERENCE_NEAR_VERTICAL`: ali a referência horizontal muda com uma inclinação mínima.

A convenção é realizada **somente pelo parâmetro `rotation` que o PyNite já aceita**: o motor envia `giro declarado + δ`, onde `δ` é o ângulo entre o `y` do PyNite com giro zero e `y_ref`. Depois da montagem, a base realmente usada pelo solver é comparada com a declarada (1e-9); divergência gera `AXIS_REALISATION_FAILED`. Rigidez, formulação do elemento e tolerâncias do solver não foram alteradas.

## Contrato

`jpn.mixed3d/3` = campos de `/2` + `local_axes: "jpn-z-up/1"` obrigatório. Resultado `jpn.mixed3d-result/3` = resultado `/2` + `local_axes.members[id]` com `declared_rotation_deg`, `reference_offset_deg`, `solver_rotation_deg` e `global_to_local`. Cargas em `coordinate_system: "local"` seguem os mesmos eixos declarados.

`/1` e `/2`: **números e hashes inalterados**. O worker isolado (`local_mixed_worker.py`, usado também pelo transporte HTTP) passa a recusar com `AXIS_CONVENTION_AMBIGUOUS`, sem publicar resultado, a requisição válida que contenha barra de pórtico com `Iy ≠ Iz` cuja orientação física dependa da direção global (δ diferente de 0° e de 180°, tolerância numérica de 1e-7 grau, ou barra quase vertical). δ = 180° é a mesma seção física e não é recusado.

**Carga em eixos locais nos contratos antigos.** Uma carga de barra com `coordinate_system: "local"` é uma direção, não uma seção: com δ = 180° (por exemplo, barra no sentido −X) o z local da biblioteca aponta para baixo e a carga física inverte. O ensaio de balanço confirma que a resposta `/2` é a imagem espelhada da resposta declarada. Por isso a guarda também recusa, em `/2`, barra com carga local e δ ≠ 0, mesmo com `Iy = Iz`. Sem carga local, δ = 180° continua aceito.

## Integração TypeScript → Python

- **Declaração explícita.** `spatialPreparation.localAxes = { convention: "jpn-z-up/1", source, revision }` (painel de preparação, seção de ligações, no modo misto). Sem ela os adaptadores emitem exatamente os `/1` e `/2` anteriores, com os mesmos bytes e hashes. Com ela, `adaptMixedProject` e `adaptLoadedMixedProject` emitem `/3`. Fonte ou revisão em branco bloqueiam com `LOCAL_AXES_REVIEW`. A declaração entra no hash da preparação.
- **Esquemas.** `zUpMixedRequestSchema` e `zUpMixedResultSchema` em `structural-loading.ts`; `/3` participa das uniões `anyMixed*`.
- **Antes do transporte** (`mixed-axes-gate.ts`, executores local e remoto): `/1` e `/2` ambíguos são recusados com `AXIS_CONVENTION_AMBIGUOUS` sem chamar o motor, o que protege também contra um backend remoto publicado antes desta correção. `local-axes.ts` contém uma transcrição dos três ramos de `Member3D.T()`, usada só para essa detecção e conferida contra o PyNite instalado em 150+ direções, incluindo os limites de `isclose`.
- **Depois do transporte.** A base informada pelo motor em `local_axes.members` é recalculada no TypeScript somente a partir da requisição (`verifyLocalAxes`, 1e-9) e, no modo de ligações, comparada com a base das ações de extremidade. Divergência gera `AXIS_REALISATION_FAILED`, sem resultado.
- **Backend HTTP.** `app.py` anuncia `/1`, `/2` e `/3`. O executor remoto aceita um backend antigo (só `/1` e `/2`); nesse caso uma requisição `/3` recebe `UNSUPPORTED_MODEL` e nada é rebaixado para `/2`. **Nenhum deploy foi feito.**
- **Segunda ordem.** O piloto P-Delta recusa modelo `/3` (`PDELTA_LOCAL_AXES_PENDING`) e modelo antigo ambíguo (`AXIS_CONVENTION_AMBIGUOUS`); ele ainda monta os eixos nativos.
- **M51.** O procedimento de flambagem lateral exige barra em +X, giro zero e base identidade; nessa orientação δ = 0, e o ensaio de regressão obtém o mesmo Mcr e os mesmos estados por `/2` e por `/3`.

Ensaios novos: `src/domain/local-axes.test.ts`, `src/domain/local-axes-project-real.test.ts` e `src/infrastructure/analysis/local-axes-real.test.ts` (60 barras horizontais, inclinadas, verticais, oblíquas em planta e com giros 0/30/90/−45° contra a solução fechada de Euler-Bernoulli nos eixos declarados, com conservação de forças e momentos no apoio).

Testes existentes afetados pela guarda: `continuous-demands.test.ts` e `whole-piece-deflection.test.ts` usavam um balanço oblíquo e inclinado, com seção girada 37° e cargas locais, em `/2`. O caso físico e as referências analíticas (todas em eixos locais) foram mantidos; a fixture passou a declarar `/3`. Nenhuma tolerância foi alterada.

## Impacto medido

- `engine/examples/*.json` (10 modelos): nenhuma barra recusada pela guarda (`validation/c1-local-axes/examples-scan.json`).
- Suítes existentes: ver a descrição do PR para os números desta execução.

## Limites

- O backend remoto publicado continua na versão anterior até um deploy autorizado: por ele, `/3` é recusado e a proteção dos contratos antigos é a do lado TypeScript.
- Não existe revisão de giro peça por peça registrada no esquema: a declaração é uma só para a preparação inteira, com fonte e revisão.
- Projetos salvos não são migrados: ao passar para `/3`, o giro de cada peça precisa de revisão explícita.
- Seções sem eixos principais alinhados (produto de inércia não nulo, por exemplo Z) continuam fora do contrato: só `Iy`, `Iz` e um giro. O giro representa a inclinação dos eixos principais.
- Excentricidade de carga, centro de cisalhamento e empenamento continuam não modelados.
- O contrato `jpn.frame3d/1,/2` (`frame3d.py`) usa a mesma base do PyNite e **não** recebeu a guarda nem a nova convenção.
- A segunda ordem (`second_order_frame.py`, `p4_frame.py`) não foi alterada.
- A regra para barras verticais é uma convenção; pilares de obras giradas em planta exigem giro declarado.

## Reprodução

```text
python -m pytest engine/tests/test_local_axes_v3.py -q
python engine/check_local_axes.py
python engine/check_local_axes.py --scan engine/examples
```
