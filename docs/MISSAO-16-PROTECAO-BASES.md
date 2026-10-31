# Missão 16 — proteção do motor frame3d anterior

Base controlada: PR #15, commit `2b89890b41d298f435cfb4f4d3e8e2b2a4b8c6a1`. PR #13 não incluído. Sem merge/deploy.

Reproduzida em Python 3.12.10/PyNiteFEA 3.2.1 a limitação de bases não ortogonais também em `frame3d.py`: barras quase horizontais ou verticais, transladadas para coordenadas próximas de 9000 m, eram aceitas pelo motor anterior. Dois testes falhavam por ausência de recusa. Cada teste compara primeiro o balanço próximo da origem com fórmulas vetoriais independentes de deslocamento, rotação, força e momento de reação, para EI isotrópico:

```
u = Ppar L/EA + Pperp L³/(3EI)
theta = d × P L²/(2EI)
R = −P; M = −r × P
```

Correção mínima: conferir finitude e `R Rᵀ=I`, atol=1e−12/rtol=0, na transformação local de cada elemento preparado pelo PyNite, antes da matriz e solução. A proteção é equivalente à do motor misto auditado. Bases inválidas retornam `INVALID_GEOMETRY`; não há mudança de eixos, geometria, cargas, apoios, rigidez ou contratos.

Validação real: baseline direcionada 136 testes; dois testes adversariais vermelhos preservados; após correção **138 testes direcionados aprovados**, sem skips, cobrindo frame3d e mixed3d. Comando:

```text
python -m pytest engine/tests/test_frame3d.py engine/tests/test_frame3d_basis_guard.py engine/tests/test_mixed3d.py engine/tests/test_mixed3d_audit.py -q
```

BLAS limitado a uma thread. Evidências em `docs/validation/mission16-math/`. A suíte completa e a integração local serão registradas separadamente na entrega funcional da Missão 16. Sem homologação normativa ou autorização de fabricação. A recusa não corrige a biblioteca nem garante qualquer origem/elemento quase alinhado; é proteção de falha fechada.
