# APK Android — OncoFlow Paciente MVP 0.11.1

Este MVP empacota a interface, os dados fictícios e a Lia por texto e voz. Na 0.6, Silero V5 roda localmente para abrir o envio de áudio somente após confirmar fala. O fluxo filtrado segue por WebRTC para transcrição na OpenAI; GPT‑4o e a voz Sarah da ElevenLabs permanecem. Saudação, interrupção pela fala implementada, símbolo que acompanha a resposta, mute, CC e nova tentativa continuam. A indicação de entrada fica em zero enquanto o filtro estiver fechado. A gravação manual permanece disponível.

A 0.9 reduz o cabeçalho e os espaços do Início para aproximar **Falar com a Lia** da primeira tela do telefone. A faixa fixa de demonstração foi removida; os avisos permanecem na entrada, no Perfil, na Lia e nas confirmações. Português do Brasil e inglês dos Estados Unidos são selecionáveis na entrada e no Perfil, com escolha salva no aparelho. Interface, dados fictícios, datas, cenários, controles e respostas da Lia acompanham o idioma, mantendo a agenda no horário de Brasília. A transcrição recebe `pt` ou `en`; GPT‑4o recebe o idioma escolhido; Sarah usa o texto localizado com o modelo multilíngue.

A 0.8 acrescenta acesso à conversa em um toque após o aceite inicial, tarefas executadas pela Lia e uma barra de chamada que permanece durante a navegação assistida. O modelo propõe uma ação estruturada; o aplicativo valida o tipo, os dados do perfil e a sessão antes de executar. Bem-estar, contato e reagendamento simulados exigem confirmação local por fala ou botões. A resposta de resultado vem do executor do app. Consultas, documentos e preferências continuam usando os mesmos dados e estado das telas.

A versão 0.7 aplica o kit visual concluído no chat **Criar modelos visuais do aplicativo**: fundo gelo, texto azul-petróleo, ações em petróleo/turquesa, Início com quatro atalhos e bem-estar com seis sentimentos. A Lia recebeu o orbe SVG do kit, ondas que acompanham os níveis reais de entrada e saída, e a mesma identidade na conversa por texto. Legendas e controles permanecem operáveis com texto até 200% e rolagem, inclusive em paisagem; movimento reduzido é respeitado. A fonte do kit está em [`../../oncoflow-ui-models/HANDOFF.md`](../../oncoflow-ui-models/HANDOFF.md). Essa adaptação preserva o fluxo de voz da 0.6 e os limites da demonstração.

As conexões aos provedores partem do próprio APK: autenticação e chamadas de texto/TTS passam pelo plugin nativo, e o WebView conecta o áudio WebRTC com credencial temporária. No modo independente, não há backend próprio. No modo conectado 0.10, os dados compartilhados dependem do servidor do painel, configurado por pareamento. Na rede local, mantenha esse servidor ativo; uma hospedagem pública futura precisa de HTTPS. A navegação abre offline; IA, transcrição e síntese precisam de internet, permissões de API válidas e créditos nos provedores.

O app não usa `server.url`. Solicita acesso à internet e permissão de microfone após iniciar a conversa ou a gravação manual; não precisa de câmera, notificações ou armazenamento compartilhado para este fluxo. A prévia web não executa a integração de IA nativa.

A 0.10 inclui sessão pareada por paciente, consulta remota e ações assíncronas da Lia. Só o APK de desenvolvimento autoriza HTTP para destinos privados explicitamente selecionados; builds de produção continuam exigindo HTTPS. O transporte hospitalar usa CapacitorHttp sem redirecionamentos ou repetição automática. Chaves de IA não são enviadas ao hospital; tokens hospitalares não entram no contexto da IA. Guia de execução na raiz da plataforma: `docs/connected-demo.md`. Resultados: [verification-v0111.md](verification-v0111.md).

## Ambiente de construção

- Node 22.21.1 / npm 10.9.4.
- Capacitor core/android/CLI 8.6.0.
- JDK Temurin 21.0.11.
- Android SDK compile/target 36; mínimo API 24 (Android 7).
- Android Gradle Plugin 8.13.0; Gradle Wrapper 8.14.3.
- Detector local: `@ricky0123/vad-web` 0.0.31 e `onnxruntime-web` 1.22.0, modelo Silero V5.
- App ID `br.com.oncoflow.paciente`, nome `OncoFlow`, versionCode 13, versionName 0.11.1.

`android/local.properties` contém o caminho do SDK da máquina e não deve ser versionado. Na raiz `oncoflow-patient`, o `.env` local contém as credenciais e as escolhas de modelo/voz; `.env.example` permanece sem segredos.

Por solicitação explícita do usuário para esta apresentação, `android/app/build.gradle` lê os valores do `.env` (ou variáveis de ambiente, quando definidas) e gera campos `BuildConfig`. Não copie chaves para o código-fonte ou para os assets web. Os campos gerados e o APK contêm as chaves e permitem extraí-las: distribua este MVP de forma restrita e revogue as chaves depois da apresentação. Não é uma arquitetura de credenciais para produção.

Configuração inicial: GPT‑4o, `gpt-4o-mini-transcribe`, voz Sarah (`EXAVITQu4vr4xnSDxMaL`) com `eleven_multilingual_v2`. Atualizar as chaves ou opções no `.env` exige novo build e reinstalação; o APK instalado não lê o arquivo do computador.

O plugin nativo cria uma sessão OpenAI do tipo `transcription` em `/v1/realtime/client_secrets`; o WebView recebe somente a credencial efêmera e negocia SDP com `/v1/realtime/calls`. A chave precisa autorizar esses endpoints além de texto/transcrição. A credencial efêmera fica em memória; a chave principal continua extraível do APK por causa da decisão explícita de incorporá-la neste MVP. A documentação oficial orienta emitir credenciais efêmeras a partir de servidor em uma arquitetura de produção: [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc).

## Reproduzir o build

No diretório `oncoflow-patient`, com Node/JDK/SDK compatíveis e dependências já instaladas:

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

O resultado do Gradle fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Trata-se de APK assinado com chave de desenvolvimento Android, adequado a teste por instalação direta. Não é uma versão de loja e não usa uma chave de publicação do usuário.

No Windows, `npm run apk:debug` ou `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1` executa build/sync/Gradle, verifica a assinatura e exporta `OncoFlow-Paciente-demo-v0.11.1.apk` e `SHA256SUMS-v0.11.1.txt` para `../output/apk/`. O script usa Android build-tools 36.0.0 para a verificação. A identificação e a validação do artefato final devem ser registradas em [verification-v0111.md](verification-v09.md); um APK intermediário não encerra essa verificação. Não inclua o `.env`, arquivos gerados com credenciais ou o APK em repositórios públicos.

`predev` e `prebuild` executam `scripts/copy-vad-assets.mjs`. O script copia `silero_vad_v5.onnx`, `vad.worklet.bundle.min.js`, `ort-wasm-simd-threaded.wasm` e seu `.mjs` para `public/vad/`, junto de licenças e proveniência. Modelo e runtime são embarcados no APK, sem CDN em execução. São cerca de 13,6 MB de arquivos antes da compressão do APK. JS e WASM devem vir da mesma versão instalada; não substitua apenas um deles.

O detector usa `AudioWorklet` e ONNX WASM com uma thread e sem proxy worker. Não depende de `crossOriginIsolated` para multithreading. O servidor local do Capacitor 8.6 fornece MIME de `.mjs` e `.wasm`; confirme o carregamento pelo WebView no APK final. O mínimo API 24 não comprova suporte desse caminho em todas as versões de WebView. Falha no detector fecha a saída e informa erro, sem recorrer ao áudio bruto.

Após alterar o código web, repetir build e sync antes de executar Gradle. Sem sync, o APK pode conter uma versão antiga da interface.

## Instalar para teste

Transferir o APK para um aparelho Android compatível e abrir o arquivo. O Android pode solicitar autorização de instalação para o aplicativo usado para abrir o APK. Em equipamento de desenvolvimento conectado por USB, `adb install -r caminho-do-apk` é outra opção. Esse comando é uma instrução de instalação, não evidência de execução em um telefone pessoal.

Escolha o perfil fictício e toque em **Falar com a Lia** no Início ou em **Lia** na navegação principal. Na primeira vez, **Entendi, ativar e conversar** aceita o aviso e inicia a conexão; permita o microfone quando solicitado. O aceite fica lembrado no aparelho, e os próximos acessos iniciam a chamada em um toque. **Prefiro digitar** permanece no texto; o aceite continua necessário antes de enviar. Abrir o app ou voltar do segundo plano não ativa o microfone sozinho.

Para testar inglês, selecione **English (United States)** em **Idioma do aplicativo** na entrada ou em **Perfil → App language**. Verifique **Explore demo**, **My schedule**, o mês em inglês e o horário de Brasília. Na Lia, experimente **“open my schedule”**, **“read my documents”** ou **“record that I am tired”**. Registros e pedidos exigem **“yes, confirm”** ou o botão correspondente; **“no, cancel”** descarta a proposta. Mudar o idioma interrompe a conversa, a captura, a reprodução e as requisições pendentes, além de revogar confirmações; inicie uma nova conversa no idioma escolhido. O idioma continua selecionado após recarregar ou reiniciar a demonstração.

Aguarde a conexão e a saudação da Lia. A entrada local passa por Silero V5 antes de alimentar WebRTC; a transcrição final aciona GPT‑4o → execução local, quando houver tarefa → TTS Sarah sem revisão nem envio manual. No servidor, a configuração usa `near_field` e `server_vad` com limiar 0,5, prefixo de 300 ms e pausa de 600 ms. Se o serviço não concluir um turno, **Terminei de falar** solicita sua conclusão após aguardar o atraso de áudio mais 100 ms. Toques repetidos são agrupados e conclusão natural ou cancelamento anulam o commit pendente. Há também um watchdog de 25 s após início de fala, seguido de prazo de 15 s para a transcrição.

Experimente abrir a agenda, ler documentos ou ajustar letras e voz. A navegação feita pela Lia reduz a chamada para uma barra com **Conversa**, controle de microfone e **Encerrar**. Pedidos de bem-estar, contato ou reagendamento mostram uma pergunta de confirmação: **“sim, confirmar”**, **“não, cancelar”** e os botões correspondentes. A confirmação expira em dois minutos e é consumida antes da execução, impedindo a repetição da mesma ação. Reagendamento não muda a consulta original; nenhum pedido avisa uma equipe real.

O símbolo acompanha o áudio sintetizado; a reprodução permanece independente dessa análise de saída. A medição de entrada só aparece com o filtro neural aberto e não é usada como limiar de detecção. **Mostrar legendas** exibe parciais da transcrição do usuário e o texto da resposta da Lia. As parciais podem mudar; o texto de saída não é sincronizado palavra a palavra com a voz.

**Silenciar microfone** desativa a trilha de entrada e limpa o trecho pendente, mantendo uma resposta já aceita. **Ativar microfone** retoma a entrada. O evento de início de uma nova fala cancela a resposta anterior. Tocar no símbolo não altera a conversa. **Encerrar**, sair manualmente pela navegação, trocar o perfil, reiniciar ou colocar o app em segundo plano interrompem a sessão e cancelam pendências; a navegação assistida e **Ver aplicativo** mantêm a conexão. Voltar Android fecha primeiro um diálogo aberto. Erros permanecem visíveis com **Tentar novamente**, que abre uma nova conexão.

O microfone permanece disponível durante TTS. O WebView recebe as opções de cancelamento de eco, supressão de ruído e ajuste automático de ganho. O filtro usa um atraso de 850 ms para preservar o começo da frase enquanto confirma fala, adicionando essa latência à entrada. Ele não separa a voz de quem apresenta de uma televisão ou de outras pessoas, nem remove todo ruído dentro de trechos liberados. O comportamento acústico, inclusive a interrupção sem captar a voz da própria Lia, ainda requer validação física. Mantenha Android System WebView atualizado, teste em ambiente tranquilo.

A gravação manual continua em **Gravar mensagem → Concluir gravação**, com revisão antes de **Enviar** e limite de 30 segundos. A camada nativa ganhou restauração correta do detector após a permissão, eventos de nível e watchdog JS: caso a conclusão nativa não chegue, solicita stop aos 31,5 s e exibe erro se ele não concluir em mais 3 s. Stop explícito preserva áudio válido sem depender de confirmação do VAD. O detector local adaptativo foi corrigido para os fluxos que habilitam fim por pausa; o botão manual continua usando conclusão explícita. Ajustes de explicação, velocidade e texto ficam em **Perfil**.

Para apresentar o roteiro urgente, abra **Explorar cenários fictícios**, escolha **Orientação urgente e alerta** e marque **Aplicar este cenário à conversa e à voz**. Fale ou digite a frase cadastrada **“Estou com muita falta de ar agora”**. A correspondência urgente mostra a orientação imediatamente e registra apenas um alerta simulado; em voz, isso pode ocorrer antes da revisão adicional da transcrição. O botão **Executar relato fictício** demonstra o mesmo roteiro sem gravação, identificando a origem fictícia. Recebimento, atribuição, fechamento e ausência de retorno são eventos manuais do painel, sem comunicação externa.

Dados e histórico ficam limitados à demonstração. Texto e áudio usados na conversa são enviados aos provedores; não use informações reais de pacientes. O APK não fornece atendimento, monitoramento ou classificação clínica de relatos livres. Nenhuma equipe real recebe alertas.

## Preparação hospitalar sem conexão ativa

O contrato e o adaptador REST assíncrono propostos estão em [hospital-integration.md](hospital-integration.md). O App e o APK continuam no modo fictício local; a camada hospitalar não é importada nem ativada pelas telas. Ainda são necessários backend compatível, autenticação e autorização por hospital/paciente, configuração explícita e ligação da interface a dados assíncronos com cancelamento e mudanças de sessão. Uma URL isolada não ativa a integração. Não há tráfego hospitalar real, atendimento clínico nem painel médico fornecido nesta versão.

## Estado da verificação — versão 0.9.0

A versão passou 226 testes unitários, 58 E2E e 14 JUnit. Build, assinatura APK v2, instalação e ensaio de interface bilíngue foram aprovados. A voz passou 12 verificações em inglês e 12 em português com APIs reais no emulador Android, abrindo a agenda e mantendo a conversa. O APK final e as limitações estão em [verification-v09.md](verification-v09.md). As evidências abaixo pertencem a versões anteriores.

## Histórico — validação da versão 0.8.0

Na rodada da 0.8, passaram 162 testes unitários, 48 testes E2E com provedores simulados e 14 testes JUnit. O build e a assinatura APK v2 passaram. O ensaio nativo por texto com GPT‑4o real concluiu 20 verificações em 13 turnos, em 19,049 s. O ensaio de voz passou 10 verificações em 23,889 s: uma fala fictícia injetada no microfone Android foi transcrita, abriu Minha agenda e recebeu resposta ElevenLabs, mantendo a chamada ativa. O relatório [verification-v08.md](verification-v08.md) identifica o APK, o ambiente, as evidências e os limites do teste em emulador. Esses resultados não validam o APK 0.9.

## Histórico — ajuste da versão 0.7.1

Removido o comando de interrupção ao tocar no símbolo da Lia. A animação, a interrupção pela fala e os controles permanecem. Artefato e verificações deste ajuste: [verification-v071.md](verification-v071.md).

## Histórico — validação da versão 0.7.0

Passaram 129 testes unitários, 39 testes E2E com provedores simulados, 14 testes JUnit e o build final do APK com verificação de assinatura. No APK final instalado no emulador dedicado, passaram navegação e testes com APIs reais de ruído, resposta automática, interrupção pela fala, mute e retomada. Os ensaios usaram áudio fictício no microfone virtual; não houve teste em smartphone físico.

Consulte [verification-v07.md](verification-v07.md) para os resultados efetivamente executados e `../../output/apk/SHA256SUMS-v0.7.0.txt` para o hash do artefato entregue. Este guia descreve como construir e testar; não comprova o comportamento do microfone, a interrupção pela voz ou o cancelamento de eco em telefone físico. Inferência offline e mocks não comprovam o transporte de áudio no WebView. A arquitetura de voz, os tempos e os limites preservados estão em [implementation-v06.md](implementation-v06.md).

## Histórico — versão 0.6.0

A 0.6 introduziu o filtro neural Silero V5 local antes do envio WebRTC, com modelo e runtime embarcados. Seu relatório permanece em [verification-v06.md](verification-v06.md), e o hash do artefato daquela entrega em `../../output/apk/SHA256SUMS-v0.6.0.txt`. Essas evidências não substituem as verificações da interface e do APK 0.7.

## Histórico — versão 0.5.0

A 0.5 introduziu entrada contínua WebRTC, transcrição em tempo real, saudação e interrupção pela fala. Seu relatório está em [verification-v05.md](verification-v05.md). O filtro neural local da 0.6 não fazia parte dessa versão.

## Histórico — versão 0.4.0

A 0.4 introduziu tela inteira, símbolo por amplitude, mute e legendas com captura por turnos. Seu relatório está em [verification-v04.md](verification-v04.md). Essas evidências não comprovam o novo transporte WebRTC, a entrada contínua ou a interrupção pela fala da 0.5.

## Histórico — versão 0.3.0

A entrega 0.3 introduziu detecção de pausa e turnos automáticos, com controle para interromper a resposta. Seu relatório permanece em [verification-v03.md](verification-v03.md). As evidências dessa entrega não comprovam a tela inteira, o símbolo por amplitude, o controle de microfone e as legendas acrescentados na 0.4.

## Histórico — versão 0.2.0

A entrega 0.2 introduziu captura manual, transcrição revisável, GPT‑4o e reprodução ElevenLabs. Seu relatório permanece em [verification-v02.md](verification-v02.md). Os testes e o artefato dessa versão não comprovam o detector de pausas nem os turnos automáticos acrescentados na 0.3.

## Histórico — verificações da versão 0.1.0 em 31/10/2026

Esta seção registra exclusivamente a entrega anterior, offline e sem voz real. Não descreve as permissões nem a integração das versões atuais com voz.

- Build final: `scripts/build-android.ps1`, exit 0; web build passou; `assembleDebug` informou `BUILD SUCCESSFUL` (2 s no build incremental).
- Artefato: `../output/apk/OncoFlow-Paciente-demo-v0.1.0.apk`, 4.337.114 bytes.
- SHA-256: `1927f43e0ccd45cef6dab65ec5085a0e83a215cbd41be98c20666c94f35d7440`.
- `apksigner verify --verbose`: assinatura v2 válida, um signatário. APK de desenvolvimento, não de loja.
- `aapt dump badging`: package `br.com.oncoflow.paciente`, versão `0.1.0`, mínimo 24, target/compile 36. Sem INTERNET ou RECORD_AUDIO; há apenas a permissão interna de receiver não exportado gerada pelo AndroidX.
- Instalado e aberto no AVD dedicado `oncoflow_demo`, emulador Android 16/API 36 x86_64, tela 1080 × 2400. `adb install -r` retornou `Success`; início da atividade final retornou `Status: ok`.
- Abertura a frio em modo avião confirmada no APK final, incluindo marca, perfis, navegação e dados locais.
- No APK final: entrada → Início → Perfil, alteração de texto para 200%, navegação para Agenda e reinício confirmado da sessão funcionaram. Controles de reinício permaneceram acessíveis com rolagem em 200%. Preferência de tamanho permaneceu após reinício, conforme especificação.
- O teste anterior à última correção de CSS também verificou Jornada, Lia, detalhes da consulta e Voltar nativo fechando o diálogo. O código de navegação Android não mudou na correção final.
- Sem `FATAL EXCEPTION` ou erro de console do Capacitor na amostra de logs inspecionada após os fluxos.
- Capturas definitivas em `../output/apk/screenshots/`: entrada, início, agenda em 200%, perfil em 200%, reinício e abertura offline.

Não houve instalação em telefone pessoal. Testes em aparelho físico, versões antigas de Android/WebView, voz real e leitura por TalkBack permanecem não verificados. Os testes descritos são de funcionamento da demonstração, sem validação clínica. O emulador dedicado foi encerrado após a verificação.

## Referências oficiais

- [Capacitor: ambiente de desenvolvimento](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor: Android](https://capacitorjs.com/docs/android)
- [Capacitor: atualização para a versão 8](https://capacitorjs.com/docs/updating/8-0)
