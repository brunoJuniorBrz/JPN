# Rastreabilidade das fontes e ausência de aprovação normativa

**Atualização após os documentos do usuário:** o registro histórico abaixo é
da primeira entrega. Foram acrescentados procedimentos parciais resistentes
NBR 14762:2010, com cláusulas, fontes locais e testes em
[ENTREGA-RESISTENCIA-UE-MRD.md](ENTREGA-RESISTENCIA-UE-MRD.md). Os PDFs não são
redistribuídos. O domínio completo e a aprovação global continuam bloqueados.

Consulta em 02/11/2026. Nenhuma cláusula normativa foi registrada como
integralmente implementada nesta revisão. O catálogo e fontes acadêmicas não
substituem o texto aplicável, suas exceções, tabelas e exemplos independentes.

| Fonte | Consulta efetiva | Consequência no motor |
|---|---|---|
| [Catálogo ABNT](https://www.abntcatalogo.com.br/) | Mostra NBR 8800:2024 Versão Corrigida:2025; não houve acesso ao texto integral | I/W: tração/ruptura, compressão, flexão/FLT, cortante, torção, interações, ligações e requisitos de estabilidade bloqueados |
| NBR 14762:2010 e 6355:2012 | Edições de referência da missão e dos manuais; confirmação integral/erratas pendente | Ue: área efetiva, instabilidades global/local/distorcional, flexotorção, interações e ligações não homologadas |
| NBR 6123, 8681 e 6120 | Levantamento de versões públicas incompleto para confirmar todos os textos e erratas vigentes; 6123:2023/corrigida 2025 e 8681:2025 são referências a conferir, não implementações anunciadas | Velocidade/fatores/pressões e fatores ULS/SLS permanecem declarações, sem valores normativos automáticos |
| [CBCA biblioteca](https://www.cbca-acobrasil.org.br/site/biblioteca) | Identificados Galpões para Usos Gerais, 5ª ed. 2026, e Uso Fácil NBR 8800:2024, 2025; download oficial exige acesso | Metadados não habilitam procedimentos resistentes; não contornado login |
| [Aço Tool — UNILA, 2025](https://dspace.unila.edu.br/items/b3b3f987-2cd4-4c22-8f20-7aa6aa02b3e7) | Trabalho educacional de tração e compressão, referência à NBR 8800:2024; PDF público consultado | Não demonstra sozinho correções de 2025 nem todos os modos da missão; não transplantadas fórmulas/código |
| [UFAL — compressão, 2020](https://educapes.capes.gov.br/bitstream/capes/572684/2/4%20-%20PFF%20-%20COMPRESS%C3%83O%20AXIAL%20-%20NOTAS%20DE%20AULA.pdf) | Notas de aula, 78 páginas; CC BY-NC-SA 4.0 | Referência conceitual, não redistribuída nem copiada para o produto comercial; não substitui procedimento integral |
| [Nbr8800.Resistencias](https://github.com/DenisDaSilveira/Nbr8800.Resistencias) | Metadata e árvore via GitHub, commit 5f5dec748cf1d65f657430924349925dd2dd6181: license=null, sem arquivo license/copying ou caminho de testes identificado | Nenhum código copiado, executado, auditado matematicamente ou aceito como oráculo |

Os números de cláusulas e tabelas ainda não verificados não foram inventados.
É necessário confirmar o conjunto integral de disposições para cada estado
limite, critérios de aplicabilidade e correções antes de cadastrar um provedor
normativo. Não há índice de utilização normativa, resistência de cálculo ou
aprovação de peça gerado por essas novas bibliotecas.

## Fontes matemáticas e software realmente utilizados

- [sectionproperties](https://github.com/robbievanleeuwen/section-properties),
  3.10.2, MIT. [Análise](https://sectionproperties.readthedocs.io/en/stable/user_guide/analysis.html)
  e [validação](https://sectionproperties.readthedocs.io/en/stable/user_guide/validation.html).
  Área/inércias de retângulos e I são confrontadas com integrais analíticas;
  J retangular usa série independente de Saint-Venant. Iw e centro de cisalhamento
  são resultados da biblioteca com refinamento, sem certificação independente
  completa por família. Escala de Iw foi testada, não confundida com validação
  de todos os valores absolutos.
- [pyCUFSM](https://github.com/brookshsmith/pyCUFSM): o artefato PyPI **0.2.0
  instalado declara AFL-3.0**. O HEAD consultado do repositório declara LGPL-3.0;
  não se atribui retroativamente essa licença ao wheel. O perfil opcional é local
  e separado, com avisos/versões registrados. Licenças instaladas estão em
  `validation/engine-release/`; não foi copiado código upstream.
- [CUFSM original](https://github.com/thinwalled/cufsm-git), MIT, commit
  `ab449cef8d05bb489df591d2e5b4e74571a793f5`. Dois arquivos MATLAB públicos
  cwlip_P e cwlip_Mx forneceram dados de referência para curvas elásticas.
  Fixtures reduzidas e licença estão em `engine/section_tests/fixtures/`.
  Essa comparação independente de implementação não equivale a dois projetos
  de cobertura completos nem a resistência ABNT.
- PyNiteFEA **3.2.1 instalado**: API/implementação de `FEModel3D.Kg` e `Spring3D`
  inspecionadas. Testes de pórtico comparam a solução fechada de viga-coluna;
  [documentação P-Delta](https://pynite.readthedocs.io/en/stable/PDelta.html) é
  complementar, sem pressupor identidade entre a versão online e a instalada.

Os relatórios guardam o procedimento efetivamente aplicado. Tensão média N/A,
autovalor elástico, convergência de malha e equilíbrio não são substitutos para
resistência normativa, revisão profissional ou liberação de fabricação.
