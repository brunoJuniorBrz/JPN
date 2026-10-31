# Vercel: homologação pendente, separada da Missão 16

## Estado e revisões

Nenhum deploy foi realizado nesta missão. Não houve requisição de engenharia a uma instalação Vercel. Portanto **não há teste remoto aprovado nem falha remota reproduzida**. A execução mista foi comprovada localmente no Windows, com processo Python real. Linux e Vercel continuam pendentes.

Infraestrutura a homologar: PR [#13](https://github.com/brunoJuniorBrz/JPN/pull/13), branch `feat/vercel-python-free-runtime`, revisão inspecionada `d529ae85c533a0b03a00f42ed1a9972a6d69ba97`. Esse trabalho **não foi incorporado** à branch da Missão 16. Antes de testar, registrar o SHA efetivamente implantado e revisar a integração com as proteções matemáticas posteriores. Não implantar automaticamente a versão antiga de `frame3d.py` sem a proteção do PR #16.

Criar um projeto backend separado, Root Directory **`engine`**. Inspecionar `api/analyze.py`, `api/analyze3d.py`, `requirements.txt`, `pyproject.toml`, `.python-version` e `vercel.json` daquela revisão. O arquivo inspecionado declara `api/*.py`, `maxDuration: 30` e exclusão de testes/exemplos/benchmarks. Confirmar Python 3.12, PyNiteFEA 3.2.1 e a compatibilidade da plataforma antes de liberar tráfego.

## Roteiro de homologação

| Ensaio | Procedimento e evidência exigida | Situação |
| --- | --- | --- |
| Build Linux | Ambiente limpo, Python 3.12, instalar os arquivos reais de dependências e o pacote; `pip check`; importar NumPy, SciPy e Pynite; registrar versões, logs e SHA | Pendente Linux/Vercel |
| Configuração | Definir `JPN_ANALYSIS_TOKEN` somente no backend e no servidor Next. Nunca usar `NEXT_PUBLIC_*`, query string ou JSON do navegador para o segredo | Pendente Vercel |
| Health | GET `/api/analyze` e `/api/analyze3d`: 200/`ready` com token configurado, 503/`configuration_required` sem ele | Pendente Vercel |
| Autorização | POST sem Bearer e com token incorreto deve retornar 401; configuração sem segredo deve retornar 503. Não registrar o cabeçalho em logs | Pendente Vercel |
| Motor 2D | POST autorizado de `engine/examples/triangle.json` no endpoint 2D; comparar com solução analítica e validação local; conferir unidades, IDs, sinais, reações, equilíbrio e os dois hashes | Pendente Vercel |
| Motor de pórtico 3D | POST autorizado de `spatial-portal.json` no endpoint 3D; comparar todos os campos com a execução local da mesma revisão; modelos instáveis e bases não ortogonais devem ser recusados | Pendente Vercel |
| Cobertura de referência | Usar **`spatial-adapted-roof.json`**, contrato frame3d, 132 nós/243 segmentos; não enviar o fixture misto a esse endpoint. Registrar SHA canônico, deslocamentos, rotações, reações, equilíbrio e IDs completos; conferir números com o fixture local e a mesma versão do motor | Pendente Vercel |
| Limites | Entrada >500000 bytes, saída >2000000 bytes, concorrência e processo de longa duração: confirmar recusa, timeout efetivo de 20 s e encerramento do subprocesso antes do limite da função (30 s). Não aumentar limites para obter aprovação | Pendente Vercel |
| Memória | Medir recursos reais e verificar os limites oferecidos pela plataforma. Os Job Objects Windows do executor local não se aplicam à Vercel. Não presumir equivalência entre memória comprometida, RSS e espaço de endereçamento | Pendente Vercel |
| Falha de dependência | Em preview descartável, retirar dependência/configuração; exigir falha controlada, sem resultado parcial, sem falsificar readiness numérica | Pendente Vercel |
| Resposta inválida | Serviço de ensaio retornando JSON inválido, versão errada, hash errado, IDs faltantes ou resposta excessiva: frontend deve recusar o resultado | Pendente Vercel |
| Integração Next | `JPN_ANALYSIS_URL=https://<backend>/api/analyze`, `JPN_SPATIAL_ANALYSIS_URL=https://<backend>/api/analyze3d`, `JPN_ANALYSIS_TOKEN` server-side. Conferir rede do navegador e bundles para ausência de token | Pendente Vercel |
| Celular | Reproduzir 375 px, seleção, erros legíveis, downloads, rolagem e invalidação após editar geometria/cargas. Comparar também a 1440 px | Local testado; Vercel pendente |
| Regressão comercial | Projetos antigos, restauração de backup, criação rápida, Perfis 3D, Acabado, quantitativos, orçamento, PDF, XLSX e DXF | Suítes locais executadas; Vercel pendente |

Os GETs implementados no PR #13 informam presença de configuração; **não importam o solver para comprovar prontidão numérica**. Completar o health com uma execução autorizada de referência antes de aprovar o backend.

O transporte antigo retorna `request_sha256` do corpo bruto e o solver retorna `input_sha256` canônico. Conferir os dois contra suas respectivas entradas; eles não precisam ser iguais entre si. Armazenar somente fixtures sintéticos na evidência pública/revisável.

## Motor misto

`/api/analyze3d` do PR #13 aceita o contrato de pórtico, não `jpn.mixed3d/1`. A nova rota `/api/experimental/mixed3d` da Missão 16 exige desenvolvimento com o launcher local, socket loopback, Host e origem exatos; permanece desabilitada em produção. **Não incluí-la como backend Vercel disponível.**

Só acrescentar execução HTTP mista à homologação remota após existir implementação específica, autenticada, isolada e validada para aquele ambiente. Nessa futura etapa, usar `mixed-adapted-roof.json` (132/207/243, 36 axiais), conferir hashes, proporção entre TESTE-1 e INVERSO-1, equilíbrio nodal/global e bloqueio do fixture instável `mixed-incomplete-all-webs-axial.json`. Não copiar hipóteses sintéticas para uma obra.

## Registro e correção de falhas futuras

Para cada execução registrar data UTC, SHA backend/frontend, preview URL, runtime/dependências, requisição sanitizada, status, duração, hashes e logs sem credenciais. Classificar como **testado localmente**, **pendente na Vercel** ou **falhou no teste remoto**, incluindo referência à evidência real.

Build/importação: corrigir versão/empacotamento em preview e repetir apenas ensaios afetados. 401/503 de configuração: conferir segredo server-side sem imprimi-lo. Timeout/memória: reduzir o domínio admitido ou rever arquitetura; nunca retornar uma análise incompleta como sucesso. Divergência numérica/hash: bloquear publicação de resultados, comparar a mesma revisão local e reproduzir em teste independente. Erro visual/persistência: preservar backup e corrigir a camada afetada antes da homologação.

Nenhum item pendente equivale a conformidade normativa, dimensionamento resistente ou liberação de fabricação.
