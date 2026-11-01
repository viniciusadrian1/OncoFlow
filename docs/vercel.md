# Publicar o OncoFlow na Vercel

O repositório contém o painel Pro em `/`, a prévia web do paciente em `/app/` e a API Node em `/api/`.
Ele usa [Vercel Services](https://vercel.com/docs/services), atualmente em Beta, com dois serviços construídos separadamente no mesmo domínio.
O código canônico do aplicativo, incluindo Android e voz, está em `patient-app/`. Este guia prepara a
publicação pelo proprietário; nenhuma conta, banco ou implantação é criada pelos scripts do projeto.

## 1. Importar o repositório

Na Vercel, escolha **Add New → Project → Import Git Repository** e selecione
[viniciusadrian1/OncoFlow](https://github.com/viniciusadrian1/OncoFlow), branch `main`.
Confira estes campos antes de publicar:

| Campo | Valor |
|---|---|
| Root Directory | `./` — raiz do repositório |
| Configuração de serviços | Usar `services` do `vercel.json`; a interface deve listar `app` e `patient-app` |
| Node.js | **24.x** |
| Overrides globais de build/install/output | Não definir: pertencem a cada serviço |

Esses valores estão versionados em `vercel.json` e `package.json`. O runtime Node vem de `engines.node`.
No modo Services, as opções de framework, instalação, build e funções ficam dentro do serviço.
([Referência de Services](https://vercel.com/docs/services/config-reference),
[versões Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).

| Serviço | Raiz | Build / saída | Acesso público |
|---|---|---|---|
| `app` | `.` | `npm run build:vercel` → `dist-static` | `/api`, `/api/*` e as páginas do Pro em `/` |
| `patient-app` | `patient-app` | `npm run build:vercel` → `dist-service` | `/app/*`; `/app` redireciona para `/app/` |

O build `app` compila o Pro e o servidor local em `dist/`, depois copia somente os arquivos públicos do Pro
para `dist-static/`. `dist/server.cjs`, mapas e fontes do backend ficam fora desse diretório. O build também
gera explicitamente o Build Output API v3: `.vercel/output/static` contém o Pro e
`.vercel/output/functions/api/index.func` contém a função Node 24 com dependências incorporadas.
Isso é necessário porque o builder Vite de Services não descobre sozinho arquivos soltos em `api/`;
a seção `functions` do JSON não cria a função. A função `api/index.ts` executa a API sem `listen()`.
As reescritas locais do serviço
encaminham o caminho completo `/api/...` à função. O build do paciente guarda HTML, assets e VAD sob
`dist-service/app/`, coincidindo com o prefixo público; o build Android continua relativo e separado.

`npm run test:vercel:artifact` reconstrói e confere o pacote de produção e executa uma cópia isolada da
função, sem `node_modules` do repositório. Sem Redis ela deve responder JSON 503, em vez do 404 da plataforma.
O teste `vercel dev --local` sozinho não prova que a função foi incluída na publicação, pois usa o servidor
Express de desenvolvimento. [Estrutura oficial de funções](https://vercel.com/docs/build-output-api/primitives).

As rotas públicas usam `/app/(.*)` para incluir a barra final de `/app/`. Os fallbacks de páginas não
reescrevem arquivos com extensão nem os módulos `@` do Vite. Isso evita devolver HTML onde o navegador
espera JavaScript, imagens ou o modelo VAD. O adaptador de caminho da API é compartilhado entre função e
servidor local para que a reescrita não caia no fallback da SPA.

`backend/` (FastAPI) e `frontend/` pertencem à arquitetura futura. Não atendem ao contrato Node usado pelo APK
atual, portanto não são serviços desta demonstração. Mantê-los fora evita encaminhar `/api` ao backend errado.

### Chamadas e bindings

| Origem da chamada | Destino | Forma |
|---|---|---|
| Navegador do Pro | API do serviço `app` | URL pública relativa `/api/...` |
| Navegador de `patient-app` | API do serviço `app` | Mesmo domínio, `/api/...` |
| APK | API do serviço `app` | Domínio público validado pela descoberta |

Não existe código de função em um serviço chamando uma função de outro serviço; nenhum binding foi
adicionado. Os clientes Vite executam no navegador e não podem consumir bindings de runtime do servidor.
Redis, OpenAI e ElevenLabs são fornecedores externos, não serviços definidos neste projeto.
Se um futuro serviço Node/Python passar a chamar outro, o binding deve ser declarado no chamador com
`type`, `service`, `format` e `env`, e lido somente no runtime. Não coloque esse endereço em variáveis `VITE_*`
nem configure manualmente uma variável que a Vercel deve injetar.
([Regras oficiais de bindings](https://vercel.com/docs/services/bindings)).

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

Como alternativa quando a integração registra apenas o status do commit, `platform/mobile-config.json`
guarda o endereço público confirmado `https://oncoflow-amber.vercel.app`. Não contém credenciais. A API
desse endereço continua sendo validada antes de abrir uma sessão no APK.

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
npm run test:vercel:artifact
npm run test:serverless
npm run test:integration
npm run build:vercel
npm --prefix patient-app run build:vercel
npx vercel@65.9.0 dev --local
```

`test:vercel` verifica os arquivos públicos, a independência dos builds e os caminhos por serviço. `test:serverless` usa
Redis REST emulado para testar prontidão, transações e persistência entre instâncias. `vercel dev --local`
(equivalente a `vercel dev -L`) inicia os dois serviços sem autenticar nem vincular um projeto. A porta fornecida
pela Vercel é respeitada pelo script `patient-app/scripts/dev-vercel.mjs`; Vite não lê `PORT` sozinho.
Na execução local, o comando do serviço `app` usa o servidor de desenvolvimento com persistência em arquivo.
O endereço público da descoberta preserva o gateway local informado por `x-forwarded-host`, aceito somente
de um peer loopback e quando é um endereço local validado. A função de produção não usa esse tratamento.
Em produção, a API usa a função e exige Redis. Esses testes
não comprovam uma integração real com Redis/Vercel sem as credenciais e a implantação que você configurar.

Com o servidor Services em execução e `ONCOFLOW_DEMO_STATE_PATH` configurado para um arquivo de teste
isolado, use `npm run test:services:smoke -- http://127.0.0.1:3000` em outro terminal. Se usou outra porta em
`vercel dev --local --listen`, informe a mesma ao teste. Ele só aceita loopback e verifica o roteador Vercel,
assets, entrada pelo navegador, relato fictício no Pro e resposta da equipe no paciente; não chama APIs de voz.

O servidor local continua disponível com `npm run build:platform` e `npm run start:platform`; a persistência
local usa arquivo, conforme o [guia local](connected-demo.md). O build Vercel não compila Android e não
incorpora chaves dos fornecedores de voz nos arquivos públicos.
