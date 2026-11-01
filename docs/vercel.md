# Publicar o OncoFlow na Vercel

O repositório contém o painel Pro em `/`, a prévia web do paciente em `/app/` e a API Node em `/api/`.
O código canônico do aplicativo, incluindo Android e voz, está em `patient-app/`. Este guia prepara a
publicação pelo proprietário; nenhuma conta, banco ou implantação é criada pelos scripts do projeto.

## 1. Importar o repositório

Na Vercel, escolha **Add New → Project → Import Git Repository** e selecione
[viniciusadrian1/OncoFlow](https://github.com/viniciusadrian1/OncoFlow), branch `main`.
Confira estes campos antes de publicar:

| Campo | Valor |
|---|---|
| Root Directory | `./` — raiz do repositório |
| Framework Preset | **Other** (`framework: null`) |
| Node.js | **24.x** |
| Install Command | `npm ci --no-audit --no-fund` |
| Build Command | `npm run build:vercel` |
| Output Directory | `dist-static` |

Esses valores estão versionados em `vercel.json` e `package.json`. A Vercel permite definir o runtime
Node pelo campo `engines.node` e selecionar Other com `framework: null`.
([Configuração da Vercel](https://vercel.com/docs/project-configuration/vercel-json),
[versões Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).

O build compila os dois frontends e o servidor local em `dist/`, depois copia somente arquivos de frontend
permitidos para `dist-static/`. `dist/server.cjs`, mapas e fontes do backend ficam fora do diretório público.
A API é executada pela única função `api/index.ts`, sem `listen()`. As reescritas preservam o caminho completo
`/api/...`; `/app` redireciona para `/app/`, mantendo as referências relativas dos assets.

## 2. Conectar Redis persistente

No projeto Vercel, abra **Storage / Marketplace** e escolha **Upstash Redis**. Conecte um recurso existente
ou crie um pela interface. Escolha pessoalmente a região e o plano; este repositório não assume um plano.
Vincule o Redis ao projeto e aos ambientes desejados, pelo menos **Production**. A integração disponibiliza
as variáveis ao projeto; depois de alterá-las, faça uma nova implantação para aplicá-las.
([Integração oficial Upstash/Vercel](https://upstash.com/docs/redis/howto/vercelintegration)).

A função aceita um destes pares de variáveis de servidor:

| Par de variáveis | Uso |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Conexão REST Upstash |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Nomes fornecidos por integrações Vercel compatíveis |

Esses são nomes aceitos pelo SDK e pela integração; os valores pertencem às configurações privadas da
função, sem prefixo `VITE_` e sem inclusão no APK ou no Git.
([SDK Node](https://upstash.com/docs/redis/sdks/ts/deployment),
[nomes das variáveis na integração](https://upstash.com/docs/redis/tutorials/nextjs_with_redis)).

Configure também:

- `ONCOFLOW_DEMO_AUTO_CONNECT=true`: ativa **Entrar no app**, sem URL ou código no fluxo principal. O valor
  não secreto já está em `vercel.json`; confira que as configurações do projeto não o desativam.
- `ONCOFLOW_REDIS_NAMESPACE`: nome estável para separar a demonstração. Por exemplo,
  `oncoflow:fictional-demo:production` em Production e outro nome em Preview. Duas implantações que usam
  o mesmo Redis e namespace compartilham os dados.
- `ONCOFLOW_ALLOWED_ORIGINS`: opcional para origens HTTPS adicionais autorizadas, conforme a configuração
  da API. O endereço canônico padrão vem da variável de sistema `VERCEL_PROJECT_PRODUCTION_URL`.

O snapshot inclui dados Pro/paciente, idempotência e sessões; um bloqueio Redis serializa o acesso entre
instâncias. Isso permite que uma nova instância carregue o estado salvo. Sem Redis configurado ou acessível,
a API e a prontidão retornam **503**. Não há substituição por memória temporária na nuvem.

## 3. Publicar e permitir acesso ao Android

Conclua a publicação na sua interface Vercel. Verifique que o domínio **Production** é público e que `/api/`
é acessível sem login da Vercel: o APK não possui uma sessão do navegador Vercel. Mantenha proteções de
Preview conforme sua necessidade. As opções ficam em **Settings → Deployment Protection**.
([Documentação de proteção](https://vercel.com/docs/deployment-protection)).

No navegador, abra `/app/` no domínio publicado e toque em **Entrar no app**. O app web usa a própria origem
da página e consulta os pacientes fictícios fornecidos pelo servidor. É uma prévia visual conectada; a
conversa de voz com os fornecedores está disponível no APK nativo.

O APK consulta o registro de uma implantação **Production bem-sucedida** do repositório público
`viniciusadrian1/OncoFlow` no GitHub, verifica a API e usa o endereço canônico retornado em
`GET /api/mobile/config`. O registro precisa estar publicado pela integração Vercel/GitHub e visível
publicamente; um status ausente, protegido ou malsucedido é apresentado como indisponível.
([Status de implantação no GitHub](https://docs.github.com/en/rest/deployments/statuses)).

Ao trocar o domínio, mantenha a implantação Production e sua configuração canônica atualizadas. Novas
entradas/reconexões consultam essa descoberta; não é necessário recompilar o APK nem digitar outro código
para cada domínio. Se o provedor não publicar o registro GitHub, há um fallback opcional do desenvolvedor
descrito em `patient-app/README.md`; ele deve conter somente a URL real do serviço, sem credenciais.

O pareamento manual com código temporário continua disponível nas opções avançadas para demonstrações
locais específicas. Não é o caminho principal do aplicativo publicado.

## 4. Conferir API e troca de dados

Teste os caminhos abaixo no domínio publicado. O resultado deve ser JSON da API, sem página HTML de login
ou do painel:

1. **`GET /api/health`**: HTTP 200, `ready: true`, `storage: "redis"`. HTTP 503 indica que a persistência ainda
   não está pronta; confira a integração, o ambiente selecionado e os logs da função.
2. **`GET /api/mobile/config`**: `apiVersion: "1"`, `demo: true`, `autoConnectEnabled: true`, `serviceUrl` e
   `defaultPatientId` válidos.
3. **`GET /api/mobile/demo-patients`**: lista de pacientes fictícios disponível.
4. No app, **Entrar no app** solicita uma sessão restrita ao paciente por
   **`POST /api/mobile/demo-session`**, com `{ "patientId": "pac-maria" }`. Não publique a resposta: ela contém
   um token de sessão.
5. Envie um relato fictício de sintomas pelo app. Confira o sinal no paciente correspondente do Pro, com
   fala literal, origem, estado e responsável. Assuma a revisão, registre um desfecho e responda na Comunicação.
6. Confira a resposta e os estados no app. Faça outra implantação com o mesmo Redis/namespace e confirme
   que os dados continuam disponíveis. Outro paciente não deve receber os relatos da primeira sessão.

A interface da equipe continua sendo uma seleção de perfis fictícios via `x-demo-usuario`. Essa demonstração
não representa autenticação institucional, prontuário de produção nem atendimento de emergência. A IA não
define prioridade clínica e a equipe aprova o conteúdo disponibilizado ao paciente.

## Verificação no computador

Com Node 24 e npm, na raiz:

```sh
npm ci
npm run test:vercel
npm run test:serverless
npm run test:integration
npm run build:vercel
npm run test:platform:smoke
```

`test:vercel` verifica a lista de arquivos públicos e a configuração de caminhos. `test:serverless` usa
Redis REST emulado para testar prontidão, transações e persistência entre instâncias. O smoke inicia um
servidor local em porta efêmera e estado isolado; não altera a demonstração em outra porta. Esses testes
não comprovam uma integração real com Redis/Vercel sem as credenciais e a implantação que você configurar.

O servidor local continua disponível com `npm run build:platform` e `npm run start:platform`; a persistência
local usa arquivo, conforme o [guia local](connected-demo.md). O build Vercel não compila Android e não
incorpora chaves dos fornecedores de voz nos arquivos públicos.
