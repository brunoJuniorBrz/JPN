# Gate M27–M30

**Veredito final de domínio: NÃO PRONTO — BLOQUEADO.**
É uma entrega funcional parcial, não a conclusão do motor de dimensionamento.
O gate está calculado no código e exportado em resistance-report/2; não é um
checkbox de usuário nem pode ser promovido por uma nota textual de conformidade.

| Etapa | Estado |
|---|---|
| Correções da auditoria M26 | Implementadas e testadas: precisão explícita, famílias separadas e cobertura por grandeza |
| Propriedades geométricas | Python real integrado localmente para Ue/I; testes analíticos; sem propriedades efetivas/resistência |
| Esforços contínuos e flecha | Campo v2 preservado; corda original e norma XYZ implementadas; critérios declarados avaliados |
| Resistência completa de perfis/interações | **Bloqueada:** nenhum provedor normativo completo validado |
| Vento/combinações normativos | **Bloqueados:** parâmetros/fatores declarados não homologados |
| Estabilidade de segunda ordem mista | **Bloqueada:** Spring3D sem Kg; P-Delta não habilitado |
| Ligações e fundação | Geometria auditada; **resistência bloqueada** |
| Dois modelos externos completos de cobertura | **Não reproduzidos:** não substituídos por curvas CUFSM ou modelos sintéticos |
| Operação local | Campos de seção/flecha/furação, recálculo e relatórios existentes; sem aprovação global |
| Validação Windows/Linux | Local Windows executada; CI configurada para ambos; só resultados remotos observados podem ser anunciados |
| Revisão profissional / responsabilidade / fabricação | Não concedidas pelo software |

Para remover bloqueios é necessário implementar e validar todos os modos
aplicáveis, localizar extremos de interações concomitantes, confirmar ações e
combinações normativas, segunda ordem física quando pertinente, ligações/bases
e os dois benchmarks globais equivalentes. Texto livre, resultados numéricos
favoráveis ou propriedades completas não satisfazem essas etapas.

`computedStructuralApproval`, `fabricationRelease` e a lista de procedimentos
normativos implementados permanecem negativos/vazia nesta revisão. Um critério
de flecha pode atender ou exceder seu limite declarado sem alterar esse gate.
Uma geometria inválida acrescenta bloqueadores e é recusada ao registrar uma
nova declaração; dados antigos continuam legíveis e seus defeitos são exibidos.

Não houve merge, promoção, mudança de autenticação nem deploy manual. As duas
configurações Vercel desabilitam esta branch, preservando as branches anteriores.
