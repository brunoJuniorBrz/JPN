# Demonstração JPN — apresentação de 7 de novembro de 2026

Base preservada: M35/PR #53, `6a64398d1e4d12577d816efb07d8483767ff4459`. Esta entrega está na branch `feat/m351-client-demonstration`, com PR próprio para revisão, sem merge ou produção. URL de preview e resultado final da CI são registrados nesse PR.

## Abrir no Windows

1. Use esta branch ou seu ZIP extraído. É necessário **Node.js 24 LTS**; a primeira abertura usa internet para instalar as dependências fixadas, se ausentes.
2. Dê duplo clique em **`Iniciar-Demonstracao-JPN.cmd`**, na raiz. Aguarde a preparação; o navegador abre em **http://127.0.0.1:3011/demonstracao**. Não é preciso digitar comandos ou importar JSON manualmente.
3. No computador desta entrega, o iniciador está em `C:\Users\Usuario\Desktop\jpn-m351\Iniciar-Demonstracao-JPN.cmd`.
4. Para encerrar, use **`Encerrar-Demonstracao-JPN.cmd`**. O iniciador mantém o serviço restrito ao próprio computador e não encerra serviços alheios.

Se já existe Python configurado em `.venv\Scripts\python.exe` ou `JPN_PYTHON_EXECUTABLE`, o iniciador o utiliza. A execução real exige o ambiente Python 3.12 e dependências fixadas do projeto. Sem esse serviço, a interface continua utilizável com a **evidência histórica explicitamente identificada**. Nenhum cálculo é simulado pelo navegador.

## Roteiro de apresentação

1. Em **Projetos**, clique **Abrir demonstração — Cobertura Tom**. Cada clique cria uma cópia local editável, preservando as outras obras.
2. Em **Visão geral**, confira **R$ 9.651,29**, 31 telhas, 107,65 m lineares de telha, seis peças comerciais U e vinte U enrijecido. Os limites de desenho de 14,28 m e 5,38 m são referências; não se tornam área real, contorno ou barras.
3. Abra **Materiais** e **Orçamento**. Consulte quantidades, valores e despesas; exporte o **resumo comercial PDF**. A edição usa o orçamento existente do JPN; a cópia alterada não é apresentada como a referência original.
4. Em **Modelo**, veja a indicação de **geometria real pendente**. Nenhuma tesoura, pilar, propriedade, apoio ou carga do Tom é presumida.
5. Em **Engenharia**, abra **Dados necessários para calcular a cobertura real**. Anote informações e fontes nos oito grupos. Dados preenchidos continuam sujeitos à confirmação do responsável técnico; não alimentam o solver automaticamente. Exporte **pendências técnicas PDF**.
6. Clique **Abrir demonstração estrutural separada**. O aviso permanente informa que o modelo matemático **não representa a estrutura do Tom**. Em **Modelo**, consulte as barras e as declarações de apoios, propriedades e carregamentos.
7. Em **Engenharia**, com o serviço disponível, execute a análise mista. O worker Python real calcula a cópia salva; a comparação usa os oráculos M35: **flecha Z em B2 = −0,00096875 m**, **reação Z em B0 = 200 N**. Abra os resultados detalhados para deslocamentos, reações/resíduos e esforços, e exporte o resumo do cálculo PDF ou resultado rastreável JSON.
8. Sem serviço Python, abra **Execução anterior verificada — evidência histórica**. O registro está em `validation/m35/browser-375.json`, commit `6a64398d1e4d12577d816efb07d8483767ff4459`. A interface verifica integridade/hash e explicita que não recalculou a obra/cópia atual. Resultado histórico não ocupa o estado de resultado calculado nesta sessão.
9. Use **Salvar demonstração**, volte a **Projetos** e reabra a cópia. **Exportar backup desta cópia** salva só essa obra e suas referências de materiais; restaure por **Configurações → Importar backup JSON → Adicionar cópias**. O armazenamento é local ao navegador/origem; não há sincronização entre computadores, localhost e preview.

## Correção e validação

- A edição/exclusão de barras agora remove os respectivos vínculos órfãos do contorno, sem criar substitutos, alterar os polígonos ou aprovar transmissão de cargas. A limpeza explícita também corrige referências importadas, mesmo sem preparação física. Dois testes de regressão.
- Testes direcionados de orçamento, cópias independentes, persistência/backup, vínculo com a fixture nativa, rejeição de oráculo para modelo alterado e evidência histórica. PDFs reabertos com leitor independente, conservando o total e as pendências.
- Playwright percorre criação → salvamento → restauração → modelo → API → Python → resultados, em **375 e 1440 px**, e testa indisponibilidade sem resultado falso. Capturas reais e entradas/resultados dessa execução em `validation/m351/`.
- TypeScript/lint locais e campanha completa existente na CI do PR. Registros finais no PR e em `validation/m351/checks.json`.

## Limites

O caso comercial não é dimensionamento da cobertura. Modelo e carregamentos reais do Tom, ações do vento, seções, ligações e vínculos precisam de confirmação técnica. Mantidos `NOT_READY_BLOCKED`, `computedStructuralApproval=false` e `fabricationRelease=false`. Nenhum kernel, contrato numérico, tolerância ou limite de execução foi ampliado. Arquivos PDF originais e dados privados não são enviados à implantação.

A eventual preview usa o projeto Vercel existente, **ambiente preview com autenticação Vercel mantida**; requer acesso autorizado à equipe. Não há promoção para produção nem desativação das proteções. Para apresentar sem depender de acesso remoto, use o procedimento Windows acima.
