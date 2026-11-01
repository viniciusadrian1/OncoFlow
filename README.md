# OncoFlow

Cada etapa do cuidado, conectada. Uma demonstração com dados fictícios reúne o painel da equipe, o aplicativo do paciente e a assistente Lia.

O Pro acompanha a jornada, revisa relatos e solicitações e publica agenda, orientações e documentos. O paciente consulta os mesmos dados, pede apoio e conversa com a Lia no APK Android. Relatos de sintomas são registrados para revisão profissional, com fala literal e origem; a IA não define prioridade clínica nem altera tratamento.

O fluxo principal é **Entrar no app**: a prévia web usa o próprio domínio e o APK descobre a implantação Production deste [repositório](https://github.com/viniciusadrian1/OncoFlow). A sessão fica restrita ao paciente fictício escolhido. O pareamento manual permanece nas opções avançadas.

A voz com os fornecedores funciona no **APK nativo**. `/app/` oferece a prévia visual conectada sem esses fornecedores. A correção de silenciar preserva o estado do microfone quando uma resposta antiga interrompida termina; falhas de síntese mantêm o texto disponível e a conexão de escuta ativa.

## Executar localmente

Com Node.js 24 e npm, na raiz:

```sh
npm ci
npm run build:platform
npm run start:platform
```

O Pro fica em `http://localhost:3000/` e a prévia do paciente em `http://localhost:3000/app/`. O servidor local mantém os dados em `outputs/.oncoflow-demo/state.json`, ignorado pelo Git. Para ativar a entrada automática local, configure `ONCOFLOW_DEMO_AUTO_CONNECT=true` no ambiente do servidor.

No Windows, `powershell -ExecutionPolicy Bypass -File .\Start-OncoFlow.ps1 -Build` prepara e inicia a plataforma. O [guia local](docs/connected-demo.md) detalha rede privada, persistência e Docker.

## Preparar sua publicação Vercel

Importe este repositório, branch `main`, com raiz `./`, preset **Other**, Node **24.x**, build `npm run build:vercel` e saída `dist-static`. Conecte um **Upstash Redis** pelo Marketplace, escolhendo o plano e a região. A API na nuvem exige persistência Redis e retorna 503 enquanto ela não estiver pronta.

O [guia Vercel](docs/vercel.md) mostra variáveis, acesso público ao APK, descoberta do domínio e verificação. Os arquivos estão preparados para você publicar; os scripts não criam conta, banco ou implantação.

## Código e verificação

| Caminho | Conteúdo |
|---|---|
| `src/` | Painel Pro e experiência web legada |
| `patient-app/` | Fonte canônica do app atual, Android, testes e assets |
| `server/` | Domínio, dados fictícios, API e persistência |
| `api/index.ts` | Função Node para a Vercel |
| `platform/` | Build, inicialização e verificações locais |

Edite o aplicativo diretamente em `patient-app/`. Não sincronize automaticamente de uma pasta irmã antiga. `build:vercel` publica somente os frontends em `dist-static`; o bundle e os mapas do servidor não entram na saída pública. Nenhuma credencial Redis ou de voz deve entrar no Git ou no frontend.

```sh
npm run lint
npm run test:integration
npm run test:panel
npm run test:platform
npm run test:vercel
npm run test:serverless
npm --prefix patient-app test
npm run build:vercel
npm run test:platform:smoke
```

O [guia do app](patient-app/README.md) descreve entrada automática, Android e voz. As regras do produto estão em [CLAUDE.md](CLAUDE.md). Perfis e pacientes são fictícios; esta implementação ainda não é autenticação institucional nem prontuário de produção.

Os resultados e limites dos testes desta preparação estão no [relatório de verificação](docs/verification-vercel.md).
