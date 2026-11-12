# M43-P3 — energia, recuperação e equilíbrio consistente

**Entrega parcial e experimental.** A formulação P2 permanece reproduzível, sem modificação da dependência PyNite 3.2.1. Uma alternativa **plana XZ**, versionada em `jpn.second-order-frame/2`, fecha equilíbrio e referências equivalentes. Não é solver corrotacional espacial, homologação normativa ou liberação produtiva. `production_enabled=false`, `normative_stability_verified=false`, `computed_structural_approval=false`, `fabrication_release=false`, `release_gate=NOT_READY_BLOCKED` em todos os resultados.

## Base e baseline anterior à correção

HEADs conferidos: #75/#79 `2b009d2aeff8b3e0c512cac5e0025fe02e702eea`; #80 `696ae3fbaa2410b70ecba3be0b3ddb2693be48af`. Nova branch `feat/m43-p3-consistent-second-order-equilibrium` baseada em #80; nenhuma dessas branches anteriores ou `main` foi modificada. Draft mira #80 para revisão incremental.

Antes da implementação, a campanha P2 foi executada novamente com OpenSees 3.8.0 isolado: oito tentativas, sete comparações completas, duas dentro de todos os limites, cinco discrepantes, uma recusa por margem. `validation/m43-p3/p2-baseline.json` e `regression.py` foram registrados no commit `4bc389c` **antes** do algoritmo. Há oito casos e 106 categorias, incluindo recusa, deslocamentos, rotações, reações, esforços, diferença axial, resíduos e refinamento.

A CI recusa piora acima de 2% da baseline, com pisos de cancelamento dimensionalmente explícitos: 1e-10 m/rad, 1e-5 N/N·m e 1e-8 nas métricas relativas. Isso protege qualidade diagnóstica entre plataformas; **não altera a aceitação física**. A outra camada verifica todos os indicadores de bloqueio. Testes adversariais demonstram que deterioração de cada categoria falha mesmo com fabricação bloqueada.

## Diagnóstico do código instalado

Inspecionados `FEModel3D.analyze_PDelta`, `Analysis._PDelta`, `FEModel3D.Kg`, `Member3D.kg`, `Member3D.f` e cálculo de reações da distribuição **3.2.1**. Hashes de arquivos instalados estão na evidência, sem copiar ou editar a dependência.

No caso bilateral, há solução `Ke d0=P`, montagem `Kg(N0)` e solução `(Ke+Kg(N0))d1=P`. `N0=EA/L (d0,6−d0,0)` usa o estado anterior. A iteração externa testa ativação de elementos unilaterais; `max_iter` não é critério Newton de equilíbrio físico. A recuperação calcula novamente `N1=EA/L (d1,6−d1,0)` e retorna `f1=[ke+kg(N1)]d1+fer`. As reações usam forças recuperadas. Portanto, resolver a matriz não demonstra que montagem, recuperação e reações são o mesmo estado.

A matriz nativa inclui os blocos transversais Hermite `N/L·[[6/5,L/10,…],…]`, além de termos axiais `N/L` e de torção `N(Iy+Iz)/(AL)`. No código efetivo, extensão positiva produz N positivo e enrijece; compressão dá N negativo. Não foi adotada a descrição de sinal do docstring como substituto da medição. Flexão biaxial compartilha esse N; torção e alongamento também recebem Kg. Não existe atualização corrotacional de diretores/chordas nessa sequência. Liberações condensam ke e kg separadamente; não foram homologadas para a alternativa.

Esse operador de coordenadas iniciais é uma aproximação de viga-coluna. Não pode ser julgado equivalente à geometria finita sem especificar os termos retidos. Iterar somente N poderia reduzir a diferença montagem/recuperação, mas não produziria por si só objetividade finita ou todas as forças conjugadas. A P3 não fez esse ajuste posterior.

**Caso sem compressão aplicada:** a comparação *linear* de todos os nós e 12 esforços globais de cada elemento passou, inclusive no quadro espacial. A divergência P2 não era uma troca de eixos/sinais linear. O carregamento horizontal do portal gera esforços axiais de sinais opostos mesmo com P gravitacional zero. Seus operadores geométricos P2/OpenSees PDelta continuam distintos em componentes pequenas; essa medição é preservada na baseline, sem ampliar tolerâncias.

## Problema mecânico da alternativa

Subdomínio: pórticos Euler–Bernoulli em XZ, seções principais sem giro, material elástico, ligações rígidas declaradas e cargas nodais mortas no plano. O ângulo plano θ é positivo em torno de **−Y global**. Os graus `[ux,uz,θ]` são um subespaço de reflexão invariante dos modelos declarados. Nenhum apoio é acrescentado e os seis graus/vínculos físicos originais permanecem no contrato. **Isso não demonstra estabilidade fora do plano.** Geometria/ações espaciais são recusadas, nunca projetadas.

Para um elemento de comprimento inicial L, chorda inicial r0 e relativa de translações Δu:

```text
r = r0 + Δu; l = ||r||; n = r/l
α = atan2(r0x rz − r0z rx, r0·r)
e = l−L = (2 r0·Δu + Δu·Δu)/(l+L)   [avaliação sem cancelamento]
b = [e, θi−α, θj−α]
C = diag(EA/L, ·, ·), Cbending = EI/L [[4,2],[2,4]]
U = 1/2 bᵀ C b; s = C b = [N,Mi,Mj]
B = ∂b/∂q; f = ∂U/∂q = Bᵀs
Kt = ∂²U/∂q² = Bᵀ C B + N He − (Mi+Mj) Hα
```

Aqui q contém duas translações e uma rotação em cada extremidade; He/Hα são as Hessianas exatas do comprimento e do ângulo em relação a q. Com D extraindo Δu, `He=Dᵀ(I−nnᵀ)D/l` e `Hα=Dᵀ[[2rxrz,rz²−rx²],[rz²−rx²,−2rxrz]]D/l⁴`. Não é recuperação por secante `Kt q`. A força N da parcela geométrica e a recuperada são **a mesma variável constitutiva do mesmo estado**, não duas estimativas posteriormente equilibradas.

As forças de extremidade derivadas são `Fi=−Nn+(Mi+Mj)[−nz,nx]/l`, `Fj=−Fi`; os momentos globais são `My,i=−Mi`, `My,j=−Mj`. As demais componentes são explicitamente zero no subdomínio. A base local fornecida acompanha a chorda atual; a comparação independente usa o vetor **global completo**, sem misturar bases iniciais/deformadas ou ordenar componentes por magnitude.

Materialmente há pequenas deformações básicas elásticas; a rotação e o comprimento da chorda são finitos. Grandes deformações materiais, plastificação, cisalhamento, empenamento e acoplamento espacial de diretores/torção não estão incluídos. P‑Δ global decorre da geometria atual. O elemento básico não contém P‑δ interno exato; esse efeito só emerge com subdivisões explícitas, cuja convergência continua obrigatória. Limites: deformação axial básica 1%, rotações básicas/nodais 0,05 rad, translações 1% do vão global, 150 nós/320 elementos.

## Equilíbrio, trabalho e Newton

Com cargas globais mortas, `Π(q)=ΣUe(q)−Pᵀq`. Newton resolve o gradiente livre `fint−λP`, com a Hessiana simétrica da mesma energia. As reações são a restrição de `fint−P` nos graus fisicamente fixos; resíduos livres são conservados como critério de solução, não rotulados como reações de apoio. Os esforços internos não recebem correções para fechar somatórios.

Translação rígida e rotação rígida plana deixam b e U invariantes. Isso implica força interna resultante zero e momento interno zero **na geometria deformada**. A auditoria soma as três forças e os três momentos `Σ[(x+u)×(P+R)+M]`, incluindo `H·uz`. Mantém-se 1e-8 por componente com as escalas da P2. Objetividade, simetria, gradiente, Hessiana por diferenças centrais e trabalho virtual `δU=fᵀδq` têm testes independentes. Blocos de K têm N/m, N e N·m conforme seus graus conjugados; a solução usa escalas diagonais e refinamento iterativo do sistema, sem arredondar respostas.

São dez incrementos reais de carga, até 30 avaliações Newton por incremento, busca de redução do residual e contagem explícita das soluções lineares/avaliações de busca. Cada incremento exige simultaneamente residual escalado ≤1e-8, incremento adimensional ≤1e-10 e mudança de força interna ≤1e-8. São registrados os números realmente executados. O espectro generalizado Kt/Ke deve permanecer positivo, com margem piloto 0,6 e condicionamento ≤1e10; essa é uma restrição de ensaio plana, não coeficiente normativo ou verificação de flambagem 3D.

`ΣU` e `Pᵀq` são registrados com nomes diferentes. Não se usa a identidade linear `U=Pᵀq/2` para declarar trabalho em uma trajetória não linear. O teste variacional confere o trabalho conjugado local; não se inventa integração exata do trabalho externo com dez incrementos.

## Evidências realmente executadas

[Dados completos](../validation/m43-p3/evidence.json), [critérios definidos antes do algoritmo](../validation/m43-p3/criteria.json), [baseline P2](../validation/m43-p3/p2-baseline.json). Referências sintéticas E=200 GPa e propriedades/geometrias explicitadas na P2; não representam uma obra ou a estrutura Tom.

- **Linear:** seis comparações completas, nós XYZ/rotações/reações e todas as extremidades, incluindo espacial. Todas atendem a `atol+1e-7·max(|a|,|b|)`, com atóis 1e-10 m/rad e 1e-5 N/N·m.
- **Corrotacional equivalente:** nove comparações completas com OpenSees **3.8.0** em outro interpretador privado, transformação **Corotational**, entradas exatas vinculadas por SHA256. Os mesmos limites acima são obrigatórios para **cada componente**; qualquer diferença fora do limite falha na CI, mesmo com bloqueios de segurança ativos.
- **Refinamento:** cantilever 32/64, portal 24/48 (145 nós finos), contraventado 18/36 (144 nós finos). Cinco ensaios atendem ao critério 1e-4 em movimento, rotação e extremidades. Quatro portais deslocáveis ainda têm erro de extremidades de 2,29e-4 a 3,37e-4: `physical_convergence_verified=false`, com bloqueio explícito. Não foi aumentado o orçamento nem a tolerância para torná-los aprovados.
- **Instabilidade:** a API recusa o cantilever 40%/95%/101% pela margem atual, sem presumir transferência do domínio P2; em teste direto da tangente física de 32 elementos, 95% tem autovalor positivo e 101% tem modo negativo. Mecanismos, não finitos, fonte/hash obsoleto e não convergência também são recusados.

| Medição | P2 | P3 alternativa XZ |
|---|---:|---:|
| A a 20% de Pcr, DX (mm) | 13,297867278 | 13,296615810 |
| Referência correspondente | OpenSees PDelta: 13,297700768 mm | OpenSees Corotational: diferença <2e-17 m |
| A, residual relativo de momento deformado | não atende 1e-8 | <4e-16 |
| B a 20%, DX (mm) | 2,304311236 | 2,304187363 |
| C a 20%, DX (mm) | 0,089560156 | 0,089556294 |
| Diferença N montagem/recuperação | não nula | zero por estado constitutivo único |
| D espacial não linear | discrepante | recusado; correção 3D pendente |

As duas colunas usam **formulações e malhas declaradas diferentes**; não são redução artificial de um erro em relação ao mesmo operador. A alternativa elimina as discrepâncias com a sua referência equivalente nos nove ensaios executados. A P2 e suas cinco divergências continuam registradas e protegidas contra regressão. A formulação plana nova não homologa a recuperação espacial antiga.

## Integração, reprodução e entrega

`Project → prepareCorotationalFrameAnalysis → diagnoseCorotationalFrameProject → mesma rota experimental → mesmo worker limitado → verificador mecânico TypeScript → relatório /2`. A seleção exige versão/tipo explícitos. O contrato /1 e a análise linear permanecem separados. O verificador TypeScript reconstrói energia/constituição, forças conjugadas, montagem nodal, resíduos, geometria, apoios e refinamento a partir da resposta e do pedido; rejeita resultados adulterados. Hashes do Project/preparação/mapeamento e invalidação após mudanças permanecem ativos.

Mesmo com convergência numérica demonstrada em um ensaio, a HTTP retorna **422 PDELTA_NOT_VERIFIED** e o relatório **NOT_READY_BLOCKED**. Exigem-se opção experimental local, origem/Host/cabeçalho; continuam 20 s/768 MiB/500 kB/2 MB, slot compartilhado, cancelamento e rejeição de JSON duplicado. Não há ativação em produção nem novo fluxo visual de dimensionamento. O deploy Git da branch está desabilitado nos dois projetos.

```text
python validation/m43-p2/reproduce.py --opensees-python <python-privado> --output .tools/p2.json
python validation/m43-p3/reproduce.py --opensees-python <python-privado> --p2-evidence .tools/p2.json
python engine/validate.py
npx.cmd pnpm@12.15.0 typecheck
npx.cmd pnpm@12.15.0 lint
npx.cmd pnpm@12.15.0 test
npx.cmd pnpm@12.15.0 build
```

Python 3.12/requisitos fixados e uma thread BLAS como na CI. OpenSeesPy 3.8.0.0/núcleo 3.8.0 apenas em ambiente privado de validação, com o hash-lock já existente, fora da aplicação/deploy. Nenhum código-fonte/binary do OpenSees foi portado ou redistribuído. [Documentação primária corrotacional](https://openseespydoc.readthedocs.io/en/latest/src/corotational.html) e [limites do operador PDelta](https://openseespydoc.readthedocs.io/en/latest/src/pdelta.html) explicam a separação de referências; a versão realmente executada vem da biblioteca, não do título da documentação.

A CI exige as duas camadas numéricas em **Linux e Windows**, além das regressões estruturais e da aplicação. SHA final, totais completos e links das execuções estão no PR draft M43-P3, sem declaração antecipada de aprovação. A prova HTTP/navegador fica em `validation/m43-p3/http-browser-proof.json`.

## Pendências M43-P4

1. Resolver o refinamento dos quatro portais sem enfraquecer tolerâncias/limites; investigar discretização/recuperação ou formulação de viga-coluna com P‑δ interno consistente, validada independentemente.
2. Derivar/implementar corrotacional **3D** com diretores, rotações não comutativas, trabalho conjugado, torção e flexão biaxial; demonstrar objetividade e equilíbrio completo contra referência equivalente. Não superpor duas correções planas.
3. Validar estabilidade fora do plano e modos próximos à bifurcação antes de ampliar o domínio. A margem plana não substitui isso.
4. Manter Spring3D, liberações, UDL/peso próprio, imperfeições, rigidez desconhecida, ligações/fundações e parâmetros normativos bloqueados até formulações e dados próprios verificáveis.

**Pode usar:** ensaios locais reproduzíveis, comparação e diagnóstico rastreável. **Não pode usar:** dimensionamento definitivo, aprovação normativa, memorial homologado ou fabricação. M43 permanece parcial.
