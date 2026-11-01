# Missão 19 — Inteligência de viabilidade de barracões (SP, MVP)

## Escopo e status
Implementação isolada no frontend TypeScript, branch dedicada. NÃO altera o motor de cálculos estruturais ou projetos salvos.

- `src/domain/fire-rules-sp.ts`: catálogo versionado da triagem e fontes oficiais.
- `src/domain/fire-feasibility-sp.ts`: função pura de análise geométrica e cenário alternativo condicionado.
- `src/domain/fire-feasibility-sp.test.ts`: testes dos limites, ausência de dados e casos com mezanino.
- `src/components/planning/fire-screening-hint.tsx`: cartão discreto no projeto rápido, sempre marcado como não homologado.

Referência oficial: Decreto estadual 69.118/2024, arts. 3º, 4º, 16, 17 e 18, Tabelas 1, 2, 5, 6J-1 e 6J-2: https://www.al.sp.gov.br/repositorio/legislacao/decreto/2024/decreto-69118-09.12.2024.html
Verificado textualmente em 01/11/2026. **Não houve revisão por profissional habilitado em SCI.**

## Premissas de segurança
- 750 m² e 12 m são limites da Tabela 5, não uma promessa de dispensa de hidrantes, projeto ou regularização.
- Altura da cumeeira NÃO equivale à altura regulamentar do Decreto.
- A projeção da cobertura NÃO equivale automaticamente à área computável; o usuário deve confirmar integralidade da área térrea, outras áreas e mezanino.
- O mezanino é somado conservadoramente à triagem; fração de 1/3 é apenas alerta de definição, não dispensa de área ou segurança.
- Regras de não-computação do art. 18 não são aplicadas automaticamente: dependem de verificação do enquadramento.
- As tabelas de hidrantes não foram transcritas da matriz HTML, evitando inversão de colunas. Condições da IT-22, IT-42, IT-14 não foram homologadas.
- A atividade econômica (risco baixo/médio/alto do licenciamento) NÃO é inferida do risco da edificação/Anexo A.
- Reformas, ampliações futuras, mudanças de ocupação e isolamento de risco exigem avaliação técnica.
- O sistema não altera medidas do projeto, apenas apresenta cenário geométrico opcional.
- Para sugerir geometria exige: edifício novo, área integral confirmada, mezanino e demais áreas declarados, terreno, recuos e área operacional mínima. Recuos são DECLARADOS, não presumidos da legislação urbanística.
- Mesmo a sugestão geométrica **não é** recomendação de economia regulatória, não comprova aprovação municipal e não compara custos.

## Evolução antes de uso por cliente
1. Profissional habilitado confere PDF oficial do Diário Oficial e tabelas por ocupação, IT-14/2025, IT-22/2025 e IT-42/2025.
2. Registrar responsável, data de verificação e versão; atribuir propriedade de manutenção e revisar a cada alteração normativa, além de revisão periódica.
3. Casos de referência de projetos reais/ITs para cada tabela e condição de hidrantes.
4. Integrar cadastro persistente de uso, terreno, mezanino e área edificada e determinar recuos municipais antes de recomendações comerciais.
5. Só depois habilitar estimativas editáveis de custo regulatório e cenários de eficiência econômica.
