# OncoFlow Paciente 0.12.0

Este diretório é a fonte do aplicativo do paciente no repositório `viniciusadrian1/OncoFlow`. O painel e o aplicativo compartilham o serviço e os dados fictícios. A versão Android usa `versionCode 14`. Não é necessário importar ou sincronizar outro repositório para desenvolver esta aplicação.

## Entrada

Toque em **Entrar no app**. O serviço escolhe o paciente fictício padrão, atualmente Maria, e fornece a identidade da sessão. Não há endereço ou código para digitar nesse fluxo. Em **Perfil → Perfil fictício conectado**, é possível escolher outro paciente da lista fornecida pelo serviço. A troca encerra a sessão anterior e cancela suas operações pendentes.

No navegador, a aplicação publicada em `/app/` usa a origem da própria página. No Android, ela localiza a publicação pelo repositório público do GitHub:

1. Revalida o endereço público canônico em cache, quando disponível.
2. Consulta `GET /repos/viniciusadrian1/OncoFlow/deployments?environment=Production&per_page=10` e o **último** status de cada deployment. Somente um último status `success` pode fornecer o endereço.
3. Valida `/api/health` e `/api/mobile/config`. Se a publicação aponta para outro `serviceUrl` canônico, valida essa origem separadamente antes de criar uma sessão.
4. Consulta a lista pública de pacientes fictícios e solicita `/api/mobile/demo-session` para o paciente selecionado pelo serviço ou pelo controle de Perfil.

O aplicativo não inventa um domínio. Sem publicação acessível, mostra **O serviço está indisponível no momento** e mantém **Explorar demonstração** disponível. A descoberta só começa quando a pessoa toca em Entrar; abrir a tela inicial não consulta GitHub nem o serviço.

**Explorar demonstração** abre o modo offline com Marina, João e Helena. Esses perfis locais podem ser trocados no Perfil e não são usados para preencher os dados de Maria ou de outro paciente conectado.

## Publicação e configuração

O guia de publicação está em [docs/vercel.md](../docs/vercel.md). Na raiz do repositório, `npm run build:vercel` prepara o painel, o serviço e os arquivos de `/app/`. Publicar na Vercel é uma ação separada; este código não exige nem executa uma publicação real durante os testes.

Para habilitar a entrada de apresentação, o serviço precisa de `ONCOFLOW_DEMO_AUTO_CONNECT=true`. Essa opção é exclusivamente para dados fictícios: permite listar e abrir sessões dos pacientes da demonstração. O backend controla o paciente padrão, a lista e a emissão dos tokens. Na nuvem, a persistência Redis configurada pelo guia é obrigatória; o serviço responde indisponível se ela não estiver pronta.

A integração da Vercel com GitHub deve publicar metadados de deployment no ambiente **Production**, com um status final `success` e `environment_url` HTTPS. A consulta do aplicativo é pública e não precisa de token GitHub. O cache evita consultas repetidas à API anônima.

Se esses metadados não estiverem disponíveis, o desenvolvedor pode criar **um** arquivo público na branch `main`, em `platform/mobile-config.json` ou `public/mobile-config.json`, com este contrato:

```text
{ "apiVersion": "1", "serviceUrl": "<origem HTTPS real da publicação>" }
```

Esse arquivo contém apenas o endereço público, sem chave, senha ou token. Ele é uma alternativa de configuração feita pelo desenvolvedor; o paciente continua usando o botão Entrar. Não há um endereço provisório ou adivinhado incluído no aplicativo.

O pareamento anterior permanece em **Conexão avançada → Conectar ao hospital**, na entrada ou no Perfil offline. Nesse fluxo excepcional, use o endereço e o código temporário emitidos pelo painel. HTTP só é aceito para endereços locais da demonstração com a opção explícita de rede local. A descoberta pública no Android exige HTTPS.

## Dados, sessões e confirmações

O aplicativo conectado e a Lia consultam a mesma visão autorizada: identidade do paciente, contexto cadastrado do câncer, agenda e preparo, jornada, documentos publicados, pedidos, mensagens e preferências. Não recebem plano interno ou hipóteses clínicas como fatos. A origem, os estados de carregamento e a falta de atualização ficam visíveis.

Tokens permanecem apenas em memória. O armazenamento do aparelho pode guardar idioma, preferências de leitura e um endereço público; não guarda credenciais da sessão. Depois de fechar ou recarregar, toque novamente em **Entrar no app**. Não é necessário obter outro código para o fluxo automático. Desconectar ou trocar de paciente cancela os consumidores da sessão antiga e impede que respostas tardias preencham a nova tela.

Bem-estar e pedidos administrativos continuam exigindo confirmação. O pedido de reagendamento não altera o compromisso: a equipe deve editar a agenda. Documentos só chegam ao aplicativo após publicação explícita. Estados como recebido, em atendimento e concluído vêm do servidor.

Relatos feitos à Lia passam pelo serviço determinístico antes do GPT. Sinais afirmativos configurados geram um registro literal e uma pendência de revisão no painel, sem confirmação adicional. Uma fala classificada como não aplicável não cria alerta. A aplicação só anuncia registro após validar o recibo do servidor; uma falha de rede mantém o resultado incerto e a repetição usa a mesma operação para evitar duplicações. Registro não significa que um profissional já leu ou que houve avaliação clínica.

## Texto e voz

Português do Brasil e inglês dos Estados Unidos estão disponíveis. A conversa ao vivo usa a integração nativa do APK Android; `/app/` no navegador é a prévia visual e conectada dos dados, sem acesso aos provedores nativos de voz.

O transporte de voz existente continua com STT da OpenAI, GPT-4o e a voz Sarah da ElevenLabs, sem alteração de fornecedores, modelos ou chaves nesta versão. O funcionamento ao vivo depende das configurações e do saldo dos provedores. Nenhum `.env` ou chave foi incluído neste repositório ou necessário para testar a entrada automática.

Microfone só é ativado depois da ação da pessoa e do consentimento. A chamada pode ser silenciada ou encerrada. O ajuste 0.11.1 preserva uma transcrição já iniciada ao silenciar, enquanto impede novo áudio do microfone. Falha de síntese mantém o texto e a conexão de escuta, com aviso e legendas; não é apresentada como uma resposta falada bem-sucedida. Cenários locais de demonstração continuam identificados e separados dos registros enviados ao painel.

Todos os dados são fictícios. O aplicativo não diagnostica, não prescreve, não define prioridade clínica e não oferece monitoramento de urgência. Orientações educativas usam o contexto autorizado; informações ausentes não são inferidas pelo tipo de câncer.

## Desenvolvimento e verificação

Requer Node compatível com `package.json`.

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Os testes de descoberta e entrada usam respostas controladas de GitHub e do serviço; não publicam um deployment, não chamam provedores e não consomem créditos. A regressão inclui a entrada em um toque, indisponibilidade com modo offline, troca de paciente, escopo da sessão e ausência de tokens no armazenamento.

Para preparar uma compilação Android posteriormente, use `npm run android:sync` e `npm run apk:debug` com SDK/JDK configurados. O script nomeia a saída `OncoFlow-Paciente-demo-v0.12.0.apk`; nenhum novo APK é necessário para a entrega do código preparado para publicação.

Os relatórios anteriores em `docs/verification-*.md` são históricos. Seus resultados de emulador, voz ou API não comprovam uma nova publicação, um novo APK ou o funcionamento atual de um provedor.
