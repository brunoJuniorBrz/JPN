# Treliça espacial axial isolada — protótipo de pesquisa

**Status:** protótipo isolado, **não** ligado ao painel, ao serviço HTTP, ao adaptador JPN→físico nem à Vercel. Não habilita cálculo de uma obra nem dimensionamento/fabricação. Entrega separada do PR #13 de infraestrutura.

## Objetivo

Experimentar um núcleo com **barras articuladas de resposta exclusivamente axial** em três dimensões, sem usar pórticos com liberações como substituição física. O contrato `jpn.truss3d/1` é intencionalmente separado de `jpn.frame3d/1`. Não há modelo misto entre barras de treliça e pórticos nesta entrega.

## Contrato explícito

- `schema_version: "jpn.truss3d/1"`, `units: "SI"`, `theory: "linear-elastic-axial"`.
- `project: { id, revision, source }` e `case: { id, source }`. Apenas **um caso explícito**, sem combinação automática.
- `nodes: [{ id, x_m, y_m, z_m }]`: coordenadas globais em metros.
- `members: [{ id, start, end, e_pa, area_m2, source, revision }]`: exclusivamente barra axial em Pa e m²; sinais: **N positivo em tração**.
- `supports: [{ node, restrained: [UX, UY, UZ] }]`: três booleanos, todos declarados. Não existem rotações em modelo de treliça; não se cria rigidez ou vínculos rotacionais artificiais.
- `loads: [{ node, fx_n, fy_n, fz_n }]`: apenas forças nodais explícitas em N; nenhum peso próprio, vento ou momento automático.
- Resultado `jpn.truss3d-result/1`: deslocamentos/reação nodais XYZ, `axial_n`, deformação, alongamento e comprimento de cada barra; equilíbrio global de força/momento, condição escalada, três graus por nó e hash de todo o input.
- Rejeita IDs duplicados, referências órfãs, barras coincidentes, nós geometricamente coincidentes, contatos não resolvidos, entradas não finitas, falta de apoio/carga, mecanismo, rigidez não positiva, matriz mal condicionada, deslocamentos ou deformações acima de 1% e resíduos de equilíbrio.
- Limites do protótipo: 100 nós, 240 barras, 100 apoios, 300 cargas. Não são capacidades de projeto.

O motor usa montagem matricial linear `K_e=(EA/L) bᵀb` com três deslocamentos globais por nó, `scipy.linalg.eigvalsh` para estabilidade e `scipy.linalg.solve` na matriz dos graus livres. Ele reutiliza do projeto atual os checadores de geometria `frame3d.geometry_check`, o hash `frame3d_model.input_hash` e a exceção `AnalysisError`. **É código novo de cálculo**: sua concordância analítica básica não equivale a revisão independente de engenharia.

## Testes e reprodução

Dentro de um ambiente Python 3.12 com os pacotes do projeto:

```sh
python -m pytest engine/tests/test_truss3d.py -q
python engine/validate.py
```

O primeiro comando verifica analiticamente `δ=PL/(EA)` e `N=P` em X/Y/Z, tração/compressão, troca da orientação do membro, treliça tetraédrica não coplanar, linearidade, reações, equilíbrio, instabilidade, casos inválidos, revisão/hash e interface JSON. A referência estática do único membro é independente da matriz implementada.

CLI de uso **local apenas**:

```sh
python -m jpn_structural.truss3d < engine/examples/truss3d-bar.json
```

**Histórico da validação preliminar:** os 27 testes originais haviam passado em Python 3.13 com substitutos dos helpers; isso não constituía validação integrada.

**Auditoria posterior em 31/10/2026:** os 27 testes originais passaram em Python 3.12.10 com as dependências reais fixadas. Foram adicionadas referências analíticas de barra oblíqua/tripé espacial e comparação direta com PyNiteFEA 3.2.1 (Spring3D axial bilateral), além de geometrias adversariais e mecanismos. A resolução passou a usar o mesmo equilíbrio diagonal usado na verificação espectral, corrigindo uma falha reproduzida com grande contraste de rigidezes. Resultado: 63 testes direcionados aprovados e validação Python completa aprovada, sem alterar os motores anteriores. Ver [relatório da auditoria do PR #14](AUDITORIA-PR-14-TRELICA-AXIAL-3D.md) para contagens, evidências, correções e ressalvas. Linux, Vercel e produção não foram verificados; o protótipo permanece isolado.

Reprodução das comparações e do benchmark de 100 nós/235 barras, com uma thread de BLAS:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python engine/audit_truss3d.py
```

Em PowerShell, configure as três variáveis com `$env:NOME='1'`. A entrada `engine/examples/truss3d-bar.json` usada pelo comando CLI acima agora está versionada e é exercitada pelo teste de round-trip real.

## Próximos passos (fora deste PR)

1. Auditoria independente em ambiente completo, incluindo comparação com a API PyNiteFEA e casos analíticos 3D não triviais, degenerações e performance. Sem falsos `passes` e sem relaxar tolerâncias.
2. Criar suporte **misto** rigoroso para membros axiais e pórticos com graus rotacionais apropriados, respeitando graus inativos em nós puramente axiais e sem vincular artificialmente as rotações. Exigir verificações independentes contra instabilidade e conexão física.
3. Só depois conectar `axial` da preparação existente à exportação do modelo e à UI. Não alterar a obra para tentar fazê-la passar: dados físicos pendentes continuam bloqueando.
4. Após o deploy separado da Vercel, verificar se motor experimental é acessível remotamente e não expô-lo a solicitações públicas sem proteção.

**Não foi executado merge, deploy nem alteração do código 2D/3D existente.**
