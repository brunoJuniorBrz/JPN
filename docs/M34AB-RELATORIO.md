# M34-A/B — geometria declarada e propriedades físicas por barra

Base confirmada: PR #46, `91bf8215a79d81292cb016d12c4f4c58cab41f20`.
Implementação testada: `2dd366c3cce5852b04834b875baaaefe1e90cd49`.
Branch independente: `feat/m34ab-flexible-physical-model`; PR draft, sem merge/deploy.
Deploy desabilitado para esta branch nos dois `vercel.json`.

## Contratos e fluxo entregue

`workspace.physicalStructure`, opcional: `jpn.declared-structure/1`, fonte `declared`, unidade mm, revisão, procedência, nós e barras com IDs persistentes. Ausência mantém a fonte gerada anterior.
`resolvePhysicalStructure()` seleciona a fonte explicitamente. O modelo compartilhado contém somente unidade, nós, peças e comprimento calculado dos extremos; não inventa área de cobertura, massa, espaçamento ou propriedades visuais.
`spatialPreparation.physicalCatalog`, opcional: `jpn.physical-catalog/1`, materiais/seções reutilizáveis e uma única lista de atribuições por barra. Propriedades/unidades, fontes e revisões reaproveitam o schema físico existente.
Precedência: atribuição da barra > grupo por papel. Referência ausente bloqueia; não herda silenciosamente. Grupos sem barras efetivamente dependentes não precisam de propriedades fictícias.
Apoios, tipos frame/axial, liberações, juntas, casos, cargas e combinações usam os contratos anteriores. A atribuição de seção não declara automaticamente tipo ou ligação.
Materiais/seções de pórticos são compartilhados por ID. Axiais usam somente E/A efetivos e suas fontes; nenhuma inércia é inventada. A segmentação conserva referências, orientação e liberações somente nos extremos originais.
Os relatórios existentes consomem geometria/propriedades resolvidas. Entradas antigas frame3d/tesoura que ignorariam atribuições individuais são bloqueadas, indicando o uso de mixed3d.

## Independência e invalidação

O exemplo `src/domain/test-support/m34ab-declared.json` tem categoria Outros, `planning=null` e medidas de cobertura vazias. Os nós/barras foram declarados diretamente; o teste proíbe qualquer chamada a `generateStructure()` durante preparação, análise e relatório.
Assinatura legada: mesma representação anterior, sem defaults ou chaves adicionais. O golden confirma igualdade literal.
Assinatura declarada: fonte, revisão, geometria e atribuições; nunca inclui a própria `geometrySignature`. Propriedades completas participam da revisão/hash do request efetivamente analisado.
Nome/notas e apresentação de cobertura não mudam o input físico. A categoria da barra é apenas apresentação quando propriedades, tipo e ambas as ligações estão explicitamente independentes do grupo; quando há herança, continua fazendo parte da identidade física.
Mudanças em geometria/atribuição exigem revisão do vínculo; seção/material alteram o hash analisado. Resultados/relatórios antigos são recusados após mudança física.
Snapshots continuam na versão 4. Campos novos opcionais, sem migração destrutiva. Backup, importação, armazenamento e captura/restauração de revisão foram exercitados, inclusive com backup antigo.

## Referência analítica antecipada

Registro: `validation/m34ab/analytic-reference.json`, com geometria, apoios, cargas, fórmulas e tolerâncias independentes do adaptador.
Modelo: dois trechos de pórtico de 1 m em +X, ambos categoria column, com seções distintas; ramo axial de 1 m em +Y ligado ao mesmo engaste B0. O extremo axial possui guia transversal explicitamente declarada, sem rotações fictícias.
E=200 GPa. F1: A=0,001 m², Iy=10⁻⁶ m⁴; F2: A=0,002 m², Iy=2×10⁻⁶ m⁴. Ramo axial: A=0,0004 m². Cargas: B2=(1000,0,-1000) N; A1=(0,500,0) N.
`ux=P/E·(L1/A1+L2/A2)`; `uz=-P/E·[(L³-L2³)/(3Iy1)+L2³/(3Iy2)]`; `ry=P/E·[(L²-L2²)/(2Iy1)+L2²/(2Iy2)]`; ramo axial `u=FL/EA`.

| Grandeza | Original | A1 e Iy1 duplicados |
|---|---:|---:|
| ux da ponta | 7,5 μm | 5 μm |
| uz da ponta | -12,5 mm | -6,666666667 mm |
| rotação ry da ponta | 0,00875 rad | 0,005 rad |
| alongamento axial | 6,25 μm | 6,25 μm |

Reações em B0: (-1000,-500,1000) N e (0,-2000,0) N·m. Diagramas determinados: N=1000 N, |V|=1000 N, |M| de 2000 a zero ao longo do balanço; axial=500 N.
Comparados deslocamentos, rotações, reações, esforços e equilíbrio; esperados, calculados e diferenças estão em `analytic-results.json`.
Tolerância relativa 10⁻⁸, pisos absolutos 10⁻¹² m/rad e 10⁻⁶ N/N·m para componentes nulas. Nenhuma tolerância do motor foi modificada.

## Compatibilidade e testes

Golden capturado na base antes das alterações: `legacy-golden.json` contém assinatura, hash, request completo e resultado nativo; `legacy-backup.json` contém o snapshot antigo. Esperados não são regenerados pela implementação modificada.
43 testes novos direcionados aprovados: solver real, dois estados físicos, mecanismo real rejeitado, segmentação, herança, persistência, golden e adversariais.
Adversariais incluem duplicatas, referências ausentes, barras nulas, nós órfãos/coincidentes, sobreposição/cruzamento, material/seção incompatíveis, apoios/ligações pendentes, revisão obsoleta e limites excedidos.
As falhas reais de desenvolvimento e suas correções ficam em `development-record.json`, com relatórios brutos; sem novos skips, estabilização artificial, retries automáticos ou mudança do limite de produção.
Fechamento local: **481 testes aprovados, zero falhas/skips**, uma única execução completa; TypeScript, lint, DXF e build aprovados. Comandos/tempos em `validation/m34ab/checks.json` e consolidação em `summary.json`.
A matriz oficial Linux/Windows e o estado do SHA final ficam vinculados ao PR draft; não são inferidos a partir do resultado local.

## Domínio bloqueado e próximas missões

Geometria declarada aceita somente cargas nodais explícitas. Vento automático, cargas de área/cobertura, peso próprio, cargas uniformes e procedimentos específicos de cobertura são bloqueados antes de chamar o gerador; sem fallback ao telhado.
O contrato mixed3d existente exige pórticos **e** axiais no modelo; não foi ampliado para modelos homogêneos. Conexões separadas/coincidentes e cruzamentos sem nó/decisão explícitos continuam bloqueados.
Limites preservados: 150 nós/320 segmentos no misto, 250 nós/600 peças na conectividade, 50 materiais/seções, 10 casos/combinações, 20 s e 768 MiB. Modelos acima dos limites são recusados, não truncados.
M34-C: medir tempo, memória, condicionamento e desempenho da conectividade antes de qualquer aumento; sem benchmark de 500 nós nesta entrega.
M34-D: validar novos percursos de cargas em geometria declarada, ampliar somente capacidades físicas demonstradas, e revisar propriedades/dimensionamento aplicável; não inferir vento, contenções ou aprovação normativa a partir desta análise.
Sem editor livre, novos geradores, IFC/DXF estrutural, mudanças no Studio 3D ou integração de PRs paralelos. Fórmulas normativas e motor numérico não foram reescritos.
Permanecem `NOT_READY_BLOCKED`, `computedStructuralApproval=false` e `fabricationRelease=false`; análise elástica experimental não libera compra, corte, fabricação ou obra.
