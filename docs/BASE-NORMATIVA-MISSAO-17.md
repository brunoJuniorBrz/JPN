# Base normativa — pesquisa e bloqueio de verificações resistentes

Pesquisa pública realizada em 31/10/2026. Nenhuma equação normativa resistente foi implementada: não foi obtido o texto integral autorizado das edições aplicáveis, com cláusulas e exemplos suficientes para validação independente. A comparação de tensão média com fy não é aprovação normativa e não foi usada como substituto.

| Norma | Edição identificada / evidência | Limite da confirmação |
| --- | --- | --- |
| NBR 8800 | **2024, Versão Corrigida:2025**, exibida no [Catálogo oficial ABNT](https://abntcatalogo.com.br/default.aspx) e na [página do documento](https://www.abntcatalogo.com.br/gep.aspx?Q=RGNZQ1JhRXB1cERyalZ5bnRXd1F5Nm5ZK1hPUWc0amxpMkg5YVJZL2EvTT0%3D) | Metadados públicos conferidos; conteúdo/cláusulas e eventuais alterações posteriores precisam de exemplar autorizado |
| NBR 14762 | **2010**, referida pelo [CBCA em seu acervo técnico](https://www.cbca-acobrasil.org.br/site/biblioteca/?bsc=ativar&bscPgn=2&bscQtdReg=10&chkCat%5B%5D=7&txtBscKeyword=) | Edição identificada em fonte institucional; situação atual de vigência/erratas ainda exige conferência direta no Catálogo/Coleção |
| NBR 8681 | **2025**, confirmada pela [ABECE, participante da comissão de revisão](https://site.abece.com.br/em-vigor-a-nova-nbr-8681/) como substituta da edição de 2003 | Anúncio primário da comissão; cláusulas, erratas e vigência final devem ser conferidas no Catálogo |
| NBR 6120 | **2019**, citada pela [Recomendação ABECE de 2025](https://site.abece.com.br/wp-content/uploads/2025/05/WEB-Recomenda_Retrofit_250321.pdf) | Edição identificada; confirmar versão corrigida e situação atual diretamente no Catálogo |
| NBR 6123 | **2023**, revisão confirmada pela [ABECE](https://site.abece.com.br/normas-tecnicas/) e pelo [anúncio de publicação](https://site.abece.com.br/em-vigor-a-nova-nbr-6123/) | Pesquisa indica versão corrigida em 2025; errata e vigência não foram homologadas nesta missão |

As páginas individuais `pnm.aspx` consultadas para 6120/6123/8681 retornaram somente o invólucro de navegação, sem texto verificável do documento. Não tratamos isso como acesso à norma. Uma página Sebrae que a busca ofereceu como possível resultado de 2010 foi aberta e identificada como **NBR 15842**, portanto descartada: não constitui evidência da NBR 14762. Não foi feita compra ou acesso indevido a documentos licenciados.

Antes de implementar resistência: registrar norma, edição, versão corrigida/errata, licença de acesso, cláusula, domínio de aplicação, equações/fatores e exemplos independentes. Revisar aplicabilidade por família real de perfil e estado limite. O cadastro `resistancePreparationSchema` é separado do solver: família (laminado/soldado/tubular/formado a frio), fy/fu, propriedades adicionais de seção, comprimentos de flambagem, contenções, fontes e revisão. Dados ausentes continuam nulos. `resistanceDiagnostics` sempre retorna `not_verified` e `approved=false`, inclusive quando o cadastro estiver preenchido.

Vento não é calculado. Para etapa futura ainda serão necessários dados normativos e de sítio/exposição, geometria, direções, pressão interna/externa e caminho de transmissão. Os contratos atuais de casos, ações, projeção da cobertura, direção e fontes constituem apenas parte dessa preparação; não há valores de vento presumidos nem coeficientes normativos automáticos.
