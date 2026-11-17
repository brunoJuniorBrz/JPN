# Revisão das combinações NBR 8681:2025 na main (ac4abf9, pós-#133)

Fonte conferida: exemplar da NBR 8681:2025 registrado em `data/normas/nbr8681-2025-combinations.json` (SHA f4020c71…, cópia UFRGS autorizada). Itens lidos: 4.3.3, 5.1.3.1 a 5.1.3.3, 5.1.4.1 a 5.1.4.4, Tabelas 1 a 6, 5.1.5.2 a 5.1.5.4.

Arquivos revistos: `data/normas/nbr8681-2025-combinations.json`, `src/domain/nbr8681-combinations.ts`, `src/domain/nbr8681-source.ts`, `src/domain/reviewed-roof-catalog.ts` (caminho da cobertura revisada).

## O que estava certo

| Item | Valor no JSON | Norma |
|---|---|---|
| γg, permanentes separadas | aço 1,25 / 1,15 / 1,10; pré-moldados e industrializados 1,30 / 1,20 / 1,15; moldadas no local 1,35 / 1,25 / 1,15; industrializados com adições 1,40 / 1,30 / 1,20; elementos em geral 1,50 / 1,40 / 1,30; favorável 1,0 | Tabela 1 |
| γg, permanentes agrupadas | 1,35 / 1,25 / 1,15; favorável 1,0 | Tabela 2 |
| Protensão; recalques e retração | 1,20 / 0,90; 1,20 / 0 (excepcional 0 / 0) | Tabela 3 |
| γq, ações separadas | truncadas 1,2 / 1,1 / 1,0; temperatura 1,2 / 1,0 / 1,0; vento 1,4 / 1,2 / 1,0; demais 1,5 / 1,3 / 1,0 | Tabela 4 |
| γq, ações conjuntas | 1,5 / 1,3 / 1,0 | Tabela 5 |
| γq,exc | 1,0 | 5.1.4.3 |
| ψ0 / ψ1 / ψ2 | residencial 0,5 / 0,4 / 0,3; comercial 0,7 / 0,6 / 0,4; coberturas, depósitos etc. 0,8 / 0,7 / 0,6; vento 0,6 / 0,3 / 0; temperatura 0,6 / 0,5 / 0,3; silos 1,0 | Tabela 6 e nota d |
| ELU normal | uma principal com γq; demais com γq·ψ0; dois conjuntos de permanentes (desfavorável e favorável) quando declarados | 5.1.3.1, 4.3.3.2 b) |
| ELU especial | γ da coluna especial; ψ0,ef = ψ0, ou ψ2 se a duração for muito curta | 5.1.3.2 |
| ELU excepcional | γq,exc = 1,0; acompanhantes com γ excepcional e ψ0,ef | 5.1.3.3 |
| ELS | γf = 1,0; quase permanente com ψ2; frequente com ψ1 na principal e ψ2 nas demais; rara com a principal característica e ψ1 nas demais | 5.1.2.3, 5.1.5.2 a 5.1.5.4 |
| Ações variáveis favoráveis no ELU | acompanhantes geradas presentes e ausentes | 4.3.3.1, 5.1.4.2 |
| Caminho da cobertura revisada | 1,25 / 1,30 / 1,0 / 1,4 / 1,5; ψ do vento 0,6 / 0,3 / 0; ψ de coberturas 0,8 / 0,7 / 0,6 | Tabelas 1, 4 e 6 |

## Divergências encontradas e corrigidas nesta branch

| # | Arquivo e linha | Valor atual | Valor correto | Item da norma |
|---|---|---|---|---|
| D1 | `src/domain/nbr8681-combinations.ts`, laço do ELS (`selections(slots,pr,false)`) | No ELS, toda ação variável acompanhante entrava sempre. Exemplo da terça do HC-B: na rara com Q principal saía G + Q + 0,3 W (sucção) = 0,352 kN/m. | Acompanhantes favoráveis omitidas. Na rara com Q principal: G + Q = 0,600 kN/m, ou seja, a carga para flecha estava 41% abaixo. | 4.3.3 (os critérios 4.3.3.1 a 4.3.3.3 valem para as combinações de serviço) e 4.3.3.1 ("apenas as parcelas que produzem efeitos desfavoráveis") |
| D2 | mesmo arquivo, rastreio do ELU (`table:`) | Com ações conjuntas, a temperatura era rotulada "Tabela 5", mas o γ usado é o da Tabela 4. A principal excepcional era rotulada "Tabela 4". | O rótulo segue a tabela de onde o γ saiu: Tabela 4 para a temperatura, 5.1.4.3 para a excepcional. Os valores numéricos já estavam certos. | Tabela 5 nota a; 5.1.4.3 |

Efeitos da D1:
- O ELS passa a ter mais combinações. Com G, Q e W1, por exemplo, o ELS sai com 9 em vez de 5.
- O limite de 256 combinações não muda. A análise fica mais longa (atenção ao teto de 300 s do Vercel).
- Os testes históricos `nbr8681-combinations.test.ts` e `nbr6120-actions.test.ts` foram ajustados para as novas contagens. Todas as reações conferidas à mão continuam iguais, e foram acrescentadas as combinações com a acompanhante ausente.

## Pontos de interpretação (sinalizados, não alterados)

1. **Conjuntos de permanentes.** O gerador aplica "todas desfavoráveis" ou "todas favoráveis", como no texto do 5.1.3.1. O 5.1.4.1 permite γg diferente por ação permanente (por exemplo, telha favorável e equipamento desfavorável), e essas misturas não são geradas. O engenheiro deve dizer se há caso em que isso governa.
2. **Ações conjuntas.** A Tabela 5 nota a diz que a temperatura "permite-se" considerar pela Tabela 4. O gerador sempre separa a temperatura e não oferece a opção de juntá-la à Tabela 5.
3. **Fogo.** A redução de ψ2 por 0,7 da Tabela 6 nota c não está implementada. O fogo está fora do domínio atual.
4. **ELS quase permanente só com permanentes.** Pela D1 passa a existir a combinação G sem variáveis. Pelo 4.3.3.1 ela é válida para efeitos em que a variável é favorável. O engenheiro deve confirmar que quer essa combinação no relatório de flechas.
5. **Classificação da telha.** O caminho da cobertura usa 1,30, de "elementos construtivos industrializados" (Tabela 1, nota a). A nota cita "paredes e fachadas pré-moldadas e gesso acartonado". Classificar a telha metálica ali é escolha do engenheiro.

Sem alteração: computedStructuralApproval=false, fabricationRelease=false, NOT_READY_BLOCKED.


## Auditoria de integração pós-#133

- O rebase desta revisão sobre a `main` mantém o trabalho recente de exportação DXF (INT-8) e os sete arquivos específicos da revisão; não houve sobreposição de arquivos com a `main` avançada.
- Regressão adicional ELS: com G=0,2, Q=0,4, W=−0,9 (valores **sintéticos**, em kN/m), uma combinação rara com Q principal deve admitir W ausente (0,60 kN/m) e presente com ψ1=0,3 (0,33 kN/m). A enumeração nunca pode truncar combinações quando o limite for excedido.
- Os cinco pontos de interpretação acima continuam **pendentes de revisão profissional**. Esta integração não valida material, capacidade de ancoragem nem obra real.
