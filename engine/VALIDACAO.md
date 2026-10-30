# Validação do motor JPN — 30/10/2026

**Status: protótipo de análise, NÃO adequado a dimensionamento, compra, corte ou fabricação.**

## Evidências efetivamente executadas

Ambiente local Python 3.13, NumPy 2.3.5, SciPy 1.17.0:

- `python -m unittest discover -s engine/tests -v`: 20/20 testes aprovados no protótipo local.
- 1.000 casos aleatórios de treliças Warren isostáticas comparados com uma implementação independente do método de equilíbrio dos nós: 1.000/1.000 dentro da tolerância de 1e-6 kN.
- Testes abrangem equilíbrio, inversão/escala de cargas, superposição, ordenação, dados ausentes e rejeição de modelo instável.

**Observação:** esses números referem-se ao protótipo local em `/mnt/data/jpn_engine_proto`; o resultado da suíte completa sobre a versão exata desta branch não foi verificado em runner remoto.

## Validação cruzada ainda não concluída

- Foi preparado `engine/tests/test_pynite_crosscheck.py` para confrontar reações, deslocamentos e força axial com **PyNiteFEA==3.2.1** em 1 modelo triangular e 12 variantes Warren.
- Foram adicionados `engine/requirements-crosscheck.txt` e `.github/workflows/jpn-structural-validation.yml`, para tentar executar essa comparação no GitHub Actions.
- **Não foi possível instalar PyNite no ambiente local: rede indisponível.**
- **Não há evidência confirmada de execução/aprovação do job do GitHub Actions.** O check pode falhar por incompatibilidades de API, diferenças de modelagem ou limitações da integração e deve ser corrigido antes de qualquer conclusão.
- A comparação considera somente treliças planas articuladas, sem peso próprio, cargas distribuídas, vento ou dimensionamento normativo.

## Limites antes de qualquer uso operacional

1. Validar integração real com PyNite e revisar o status de CI.
2. Corrigir todas as divergências entre solvers; documentar hipóteses e convenção de sinais.
3. Acrescentar modelos de cargas, combinações, propriedades de seções e vínculos reais.
4. Implementar e validar verificações normativas independentes para resistência, estabilidade e serviço.
5. Validar ligações/soldas e desenhos de fabricação com profissional habilitado.
6. Só liberar lista de compras definitiva/corte a partir de documentação técnica aprovada.
