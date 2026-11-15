# M43-P7 — kernel espacial compilado (pesquisa)

Base: PR #89, SHA `0dd732652d917ad4c8cf760d8b1a10840d167b3e`. Produção, P4/P5, P6 e
testes históricos não foram alterados. Mantidos `computed_structural_approval=false`,
`fabrication_release=false`, `release_gate=NOT_READY_BLOCKED`.

## O que mudou

`experiments/m43_p7/` substitui **só a avaliação do elemento** (energia, gradiente,
Hessiana) por código Numba 0.68.1 em modo nativo (`@njit`, sem object mode):

- `jets.py`: jet de 2ª ordem como uma matriz `(n+1)×(n+1)` (valor, gradiente, Hessiana),
  mesmas regras e ordem de termos de `second_jet.Jet`.
- `kernel.py`: mesma cinemática e funcional de `m43_p6/element.py`. Regra da cadeia por
  blocos: estágio 1 (12 DOF) → 10 intermediários `w = [extensão da corda, comprimento,
  quatérnio local i (4), j (4)]`; estágio 2 (10 variáveis) → logaritmo, arco Hermite,
  curvatura material/torção ou flexão histórica. `H = Jᵀ E_ww J + Σ E_k ∂²w_k`, exata.
  Os mesmos bloqueios, na mesma ordem e com os mesmos códigos.
- `compiled.py` / `pilot.py` / `worker.py`: caminho opt-in (`--kernel compiled|python`).
  Newton, critérios, auditorias de equilíbrio/estabilidade e saídas são os objetos do P6.

## Resultados (Windows 10, Python 3.12.16, NumPy 2.5.4, SciPy 1.18.1)

**Elemento isolado** (`milestone.py`): curvatura material 13,2 → 0,46 ms (29×);
flexão histórica 6,5 → 0,34 ms (19×). Desvio escalonado máx.: gradiente 5e-16,
Hessiana 2e-15. Compilação a frio: **87 s** (45 funções, uma especialização cada);
com cache nativo: import 1,1 s + carga 0,42 s.

**Processo completo, limite 20 s / 768 MiB, sem cProfile** (`benchmark-win32.json`, 2 repetições):

| Malha | Python total / solução | Compilado total / solução | Commit máx. compilado |
|---|---|---|---|
| 2 | 9,7 / 7,6 s | 3,3 / 0,52 s | 187 MiB |
| 3 | 14,1 / 11,9 s | 3,4 / 0,79 s | 187 MiB |
| 4 | 17,6 / 15,6 s | 3,7 / 1,14 s | 189 MiB |
| 6 | TIMEOUT | 4,6 / 2,1 s | 194 MiB |
| 8 | TIMEOUT | 5,8 / 3,3 s | 196 MiB |

Malhas 2/3/4: objeto candidato com a mesma estrutura, nenhuma diferença discreta
(iterações, aceitações), grandezas físicas ≤ 5e-13 escalonado. Malhas 6/8 contra o
Python sem limite (26 s / 35 s): idem, desvio físico máximo 1,3e-11 (momento de reação).

**Equivalência** (`test_equivalence.py`, 135 testes): 15 classes de estado × 2 modos
(reto, tração, compressão, flexão biaxial, torção, combinações, inclinado, giro da seção
30/90/137°, inversão, limites de rotação/deformação, ramo de série de pequenos ângulos),
seção isotrópica/anisotrópica, 96 estados convergidos (malhas 4 e 8), covariância rígida,
autoequilíbrio, diferenças finitas independentes, bloqueios. Metas: energia 1e-12,
gradiente/esforços 1e-10, Hessiana 1e-8 (escalonados; pisos absolutos justificados no teste).
Suíte P6 + mecânica P4: 190 testes passaram neste ambiente.

**SPATIAL** (`spatial_convergence.py`, referência qualificada do P6 `reference-v2-evidence.json`,
`campaign.evaluate` e critérios P5 inalterados):

| Malha | Erro translação | Utilização máx. translação | Todos os limites | Tempo |
|---|---|---|---|---|
| 2 | 1,476e-8 m | 68,7 | não | 3,0 s |
| 3 | 3,322e-9 m | 15,5 | não | 3,5 s |
| 4 | 1,097e-9 m | 5,18 | não | 3,8 s |
| 6 | 2,234e-10 m | 1,13 | não | 4,6 s |
| 8 | 7,158e-11 m | 0,42 | **sim** | 6,2 s |
| 16 | 4,604e-12 m | 0,11 | **sim** | 15,5 s |

Malhas 2/3/4 reproduzem exatamente os valores publicados no P6. Equilíbrio físico verificado
em todas. Ordens observadas (somente onde o erro > 10× a incerteza da referência): translação
3,68/3,85/3,92; rotação, esforços e reações 3,94–4,13. A "ordem ≈ 2" registrada antes é da
energia nativa do OpenSees (referência), não do candidato.

## Limitações

- Somente Windows medido localmente; Linux depende do workflow `m43-p7.yml`.
- Compilação a frio de 87 s excede 20 s: o cache nativo (`NUMBA_CACHE_DIR`, padrão em
  temp) precisa ser construído antes (`benchmark.py --warm-cache-only`); o cache é
  específico da CPU/versões. Sem cache, o worker estoura o tempo (falha segura).
- Dependência: numba 26 MiB + llvmlite 116 MiB instalados (Windows). Não incluída no
  lock de produção nem na Vercel; custo provavelmente incompatível sem avaliação própria.
- O caminho compilado aceita corda exatamente nula com o bloqueio `SPATIAL_DEGENERATE_CHORD`;
  a referência Python levanta `ZeroDivisionError` antes do bloqueio (comportamento prévio do P6).
- Só o modo `REUSE_RECIPROCALS=True` (padrão da campanha) foi compilado.
- Novo gargalo (perfil diagnóstico, malha 8): `audit_tangent` (autovalores densos por
  iteração) ≈ 1,5 s de 3,6 s; kernel ≈ 1,3 s; importação ≈ 1,9 s por processo. A auditoria
  não foi alterada.
- SPATIAL: estudo de malha única; o contrato histórico pareado não foi executado e a
  aprovação não é inferida. TORSION permanece BLOQUEADO (não reavaliado).

## Reprodução

```
python -m pip install -r engine/requirements-validation.lock
python -m pip install numba==0.68.1 llvmlite==0.50.0
python validation/m43-p7/benchmark.py --warm-cache-only
python validation/m43-p7/milestone.py
python -m pytest experiments/m43_p6 experiments/m43_p7 engine/tests/test_p4_mechanics.py -q
python validation/m43-p7/benchmark.py --meshes 2 3 4 6 8 --repeat 2
python validation/m43-p7/spatial_convergence.py --meshes 2 3 4 6 8 16 --python-reference 6 8
```
Mesmos comandos em Linux e Windows (definir `OPENBLAS_NUM_THREADS=OMP_NUM_THREADS=MKL_NUM_THREADS=1`).
