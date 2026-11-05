# Release candidate integrado — Motor M21 + JPN 3D Studio

**Estado:** experimental, *não* homologado para dimensionamento ou fabricação. Documento de integração criado em 02/11/2026.

## Objetivo

Combinar em uma única branch de revisão as funcionalidades desenvolvidas em paralelo pelo Codex e as melhorias de visualização/auditoria. Manter o projeto `main` e a produção intactos até validação final.

**Branch de integração:** `integration/m21-studio-release-candidate`

### Base de engenharia — pilha de dependências

| PR | Entrega |
|---|---|
| #18 | Peso próprio explícito e cargas distribuídas no motor misto |
| #19 | Entrada/execução de análise Python na Vercel |
| #20 | Integração remota protegida e rastreável |
| #22 | Catálogo técnico de perfis, sem preços presumidos |
| #24 | Caminho das cargas por área nas terças de coberturas retangulares |
| #25 | Auditoria independente da distribuição de cargas e do peso |
| #26 | Referências analíticas teóricas de escoamento e Euler (não normativas) |

### Integração visual

- PR #23: Studio 3D, visibilidade por camadas, isolamento, vistas alinhadas, controles para dispositivos móveis, preservação da câmera no redimensionamento.
- A integração visual foi realizada por **PR #27**, mergeado **apenas nesta branch** (não na `main`).
- Nenhuma geometria ou propriedade física é alterada ao filtrar o visualizador.

## O que testar no candidato integrado

1. Criar cobertura retangular de uma água e duas águas, alternar 2D/3D e modo Acabado.
2. Selecionar uma barra, isolá-la, ocultar categorias e restaurar todas, inclusive em 375 px.
3. Usar vistas superior/frontal/lateral; redimensionar após orbitar sem reiniciar a câmera.
4. Abrir a análise mista experimental, usar o exemplo sintético e conferir ação por área → terça → segmentos → Python.
5. Confirmar forças, momentos, seleções 3D e rastreabilidade de cargas de duas águas e cumeeira.
6. Com dados físicos explicitamente declarados, inspecionar referências teóricas de Euler/escoamento; ao mudar geometria, comprovar o bloqueio de revisão obsoleta.
7. Rodar todo o pipeline CI: Python em Ubuntu e Windows, auditoria independente, TypeScript, lint, Vitest, DXF, Playwright e build.
8. Confirmar que os resultados não alteram material de compra/quantitativos nem recebem sinalização de aprovação normativa.
9. Verificar a autenticação e a integração remota **em ambiente de testes**, antes de qualquer futura publicação.

## Barreiras técnicas ainda abertas

- Não é um dimensionador conforme ABNT; não libera uso para fabricação. Faltam ações de vento normativas, combinações de projeto, verificações completas de aço formado a frio/laminado, ligações, estabilidade, revisão de engenheiro e análise da obra real.
- Coberturas em L e adjacentes possuem contrato geométrico preliminar, mas **não são analisáveis**.
- A análise por área só cobre a geometria retangular suportada, com terças paralelas e caminho físico explicitamente declarado.
- O código não deve adivinhar propriedades físicas, vínculos, cargas ou coeficientes.
- Não incorporar bibliotecas de análise adicionais nem duplicar cálculos para acelerar a integração.
- Documentar eventuais divergências físicas, de unidades, da infraestrutura ou de interface antes de liberar versão.

## Política de publicação

Os arquivos `vercel.json` da raiz e de `engine/` desativam deploy Git automático **desta branch**. A `main` não foi modificada. O objetivo deste candidato é disponibilizar uma revisão **integradora**, não publicar automaticamente alterações experimentais.

Antes de liberar para uso cotidiano: ter CI de integração verde, revisar a pilha de PRs, documentar limitações visíveis, testar a prévia no iPhone e com o engenheiro, e realizar uma publicação consciente e reversível. Não remover bloqueios de análise por conveniência.
