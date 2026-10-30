# JPN — protótipo isolado de análise de treliças 2D

**Não usar para compra, corte, fabricação ou execução de obras.** Esta etapa não altera o frontend ou os cálculos de quantitativos existentes.

Este motor implementa a análise elástica linear de treliças planas de nós articulados pelo método da rigidez direta. Usa **NumPy e SciPy** na álgebra matricial; não inventa algoritmo de fatoração. Calcula deslocamentos, reações e esforços axiais, com **tração positiva e compressão negativa**. Isso **não** é dimensionamento resistente. O modelo não representa vento, peso próprio automático, cargas distribuídas, ligações, soldas, flambagem, flexão, contraventamentos e verificações normativas.

Requisitos: Python 3.11+; `numpy>=2.1,<3`, `scipy>=1.14,<2`. Para uso reproduzível, fixar versões exatas depois de testes de compatibilidade. Estudar PyNiteFEA (MIT) para análise de pórticos 3D, sem presumir validação brasileira.

Na raiz do repositório:

```sh
python -m pip install -r engine/requirements.txt
python -m unittest discover -s engine/tests -v
python -m engine < engine/examples/triangulo.json > resultado.json
```

Contrato de entrada: `schema=jpn-truss2d-v1`, `units=m-kN`; `nodes` possuem `id,x_m,z_m,fix_x,fix_z`; `members` possuem `id,start,end,e_kn_m2,area_m2`; `loads` possuem `node,fx_kn,fz_kn`. `200000000 kN/m² = 200 GPa`.

O resultado possui `input_sha256`, diagnóstico de equilíbrio, reações, deslocamentos e esforços por barra. Não há resultado para instabilidade ou entrada inválida. O hash evita confundir resultados de revisões diferentes. As propriedades elásticas, áreas, vínculos e cargas precisam ser fornecidas explicitamente.

Próximas etapas: teste cruzado com PyNiteFEA e exemplos independentes, projeto de interface de cargas/vínculos, validação de modelos de treliças e pórticos, implementação normativa separada e integração segura com o frontend. Resultados desta etapa não podem aparecer como verificação de segurança.

Uma cópia do protótipo foi testada localmente com seis testes em 30/10/2026. As dependências não são instaladas automaticamente no deploy da Vercel.
