# Dependências opcionais da campanha M27–M30

Não há redistribuição de código das normas ABNT, das notas UFAL, do Aço Tool
ou de Nbr8800.Resistencias. Nenhum código C# sem licença foi copiado.

| Artefato utilizado | Versão/licença observada | Registro |
|---|---|---|
| sectionproperties instalado | 3.10.2, MIT | [Licença](validation/engine-release/sectionproperties-installed-LICENSE.txt) |
| pycufsm instalado do PyPI | 0.2.0, AFL-3.0 | [Licença](validation/engine-release/pycufsm-installed-LICENSE.txt) |
| CUFSM original, dados MATLAB reduzidos | commit ab449cef8d05bb489df591d2e5b4e74571a793f5, MIT | [Licença](../engine/section_tests/fixtures/CUFSM-LICENSE.txt) e fonte/SHA256 em cada fixture |

O HEAD pyCUFSM consultado (`7e5a25aedff60ea23d76cd64f3d82bede43131fe`)
usa LGPL-3.0; não é o artefato wheel utilizado. A licença efetiva do wheel não
foi inferida a partir da licença atual do GitHub. Conferir estes registros ao
mudar versão ou forma de distribuição. As licenças integrais e hashes dos textos
instalados foram preservados. Bibliotecas transitivas seguem seus próprios
metadados; os arquivos lock fixam versões sem incorporar seus fontes ao JPN.

Os perfis são locais e separados do runtime Vercel. O requisito opcional
sectionproperties inclui o lock anterior e não modifica as versões de NumPy,
SciPy ou PyNite desse motor. O perfil FSM é outro ambiente Python, pois pycufsm
0.2.0 falha com conversões escalares removidas no NumPy 2.5.4. Não há monkeypatch
de NumPy nem downgrade do solver principal. As depreciações conhecidas do perfil
FSM compatível são registradas no resultado; outros avisos bloqueiam a execução.
