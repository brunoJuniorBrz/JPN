# PR #15 — pórticos + barras axiais bilaterais em 3D (protótipo experimental)

**Status:** código isolado. **Não** conectado ao JPN, ao adaptador geométrico/físico, ao endpoint Python, ao painel, nem à Vercel. Não está liberado para projeto executivo, seleção de perfis, orçamento técnico ou fabricação.

## Decisão técnica

Usar **PyNiteFEA 3.2.1**, já fixado pelo JPN, para **dois elementos físicos distintos no mesmo sistema global**:

- `kind: frame`: membro Euler–Bernoulli com E, G, Poisson, A, Iy, Iz, J, orientação e liberações explícitos. Usa `FEModel3D.add_member`.
- `kind: axial`: mola espacial **bilateral**, `ks = E × A / L`, `FEModel3D.add_spring(... tension_only=False, comp_only=False)`. Mola serve apenas como barra axial linear, **não** simula viga com liberações nem cabo unilateral.

Não criar molas fictícias para estabilizar rotações. Um nó ligado a qualquer frame mantém todos os seis graus de liberdade. Para nó tocado **apenas por barras axiais**, as rotações não fazem parte do modelo mecânico: os três slots rotacionais da API de seis graus do PyNite são eliminados *matematicamente*, deixando somente UX/UY/UZ. É proibido declarar restrições rotacionais ou momentos aplicados nesses nós. A saída registra `active_rotations: false`. Testes precisam confirmar que isso não altera as reações físicas.

O protótipo mantém **seu próprio contrato**, `jpn.mixed3d/1`, sem alterar `jpn.frame3d/1` nem `jpn.truss3d/1`. Exige projeção, fontes/revisão, material e seção explícitos para frames, E/A por barra axial, apoios de seis flags explícitas, cargas nodais completas por caso, combinações e coeficientes declarados. Unidades exclusivamente SI; Z global para cima.

## Cálculos e diagnósticos

`analyze_mixed3d(data)` devolve `jpn.mixed3d-result/1` (apenas experimental), com hash canônico completo do input, resultados nodais, força axial (N positivo em tração), forças locais de extremidade para frames, resíduos globais de forças e momentos e condição numérica escalada.

Impede entradas não finitas, materiais/seções sem origem, ID/ligação ausente, liberação translacional, torção duplamente liberada, cruzamentos/juntas implícitas, desconexões, apoios artificiais, mecanismos, má condição (>1e10), deformações/movimentos acima do domínio operacional e falhas do equilíbrio relativo (>1e-8). Não há supressão de avisos de instabilidade.

## Validação

Foi criado `engine/tests/test_mixed3d.py`, com:
- teste do mapeamento correto dos nós puramente axiais e dos nós com frame;
- 15 mutações de entrada adversariais e falhas fechadas;
- teste de junção no meio da viga e de rastreabilidade;
- comparação independente para viga em balanço (comprimento 2 m, rigidez flexional EI=200e9×1e-5 N·m²) ligada a barra vertical EA/L=(200e9×.001)/1 N/m. Em B, carga de −1.000 N em Z: `u_Bz = −1000 / (3 EI / L³ + EA/L)`, `N_spring = −(EA/L) u_Bz`;
- teste de perda de estabilidade se as rotações da base do frame forem liberadas;
- proporcionalidade linear de cargas e hash de revisão.

**Limitação da execução desta rodada:** em uma cópia local provisória, os validadores equivalentes passaram 18 testes e 3 testes que requerem PyNite ficaram pulados porque o ambiente de execução disponível não tinha PyNite instalado. O código publicado neste PR foi adaptado para reutilizar os helpers **reais** de `frame3d_model`, e os testes específicos desta versão **ainda precisam ser executados no checkout real**. Não apresentar estes passes provisórios como validação final. Nenhuma comparação real com PyNite, benchmark, CI, Linux ou deploy foi feita nesta missão.

## Tarefas de auditoria obrigatórias antes de merge

1. Executar Python **3.12**, **PyNiteFEA 3.2.1**, NumPy/SciPy reais, `python -m pytest engine/tests/test_mixed3d.py -q` e `python engine/validate.py`. Conferir compatibilidade da API `Analysis._prepare_model`, `FEModel3D.Ke`, `model.springs[mid].axial(combo)` e geometria de membros físicos.
2. Comparar analiticamente rigidez equivalente viga+mola, reações, momentos, forças axiais e orientação de eixos, com pelo menos um **referencial independente** não construído via `analyze_mixed3d`. Testar pórtico espacial não coplanar + contraventamento axial, escada de rigidezes, rotação de coordenadas e conexões articuladas.
3. Verificar que eliminar DOFs rotacionais em nós exclusivamente axiais não cria apoios físicos, e que rotações de nós com frames não são removidas mesmo com liberações. Casos totalmente articulados com rotações sem rigidez devem recusar explicitamente se não suportados.
4. Conferir equilíbrio **nodal**, energia e resíduos de todos os membros, além do equilíbrio global. Adicionar verificações se faltar alguma antes de aprovar.
5. Provar falhas seguras: singularidades, geometrias inválidas, loads invalid, rigidez muito fraca/forte, casos sem carga, interseções sem nó, conexões soltas e saída não finita. Impor timeout/RSS **no executor futuro** antes de criar endpoint público.
6. Testar suíte anterior sem regressões (treliça 2D, axial 3D, pórtico 3D e adaptadores), sem afrouxar tolerâncias nem modificar fontes aprovadas.
7. Se encontrar defeito, corrigir em branch deste PR, registrar caso vermelho e posterior passagem; manter draft até evidência e solicitação para integração.

**Não implementar ainda:** modelo de obra, exportação fabricação, dimensionamento ABNT, flambagem, vento, peso próprio automático, ligações semirrígidas, cabos tension-only ou interface. PR #13 de deploy Vercel continua independente.
