# OncoFlow Paciente — MVP conectado 0.11.1

A 0.11.1 corrige o mute: ele silencia a captação sem descartar a transcrição já em andamento ou interromper o processamento e a resposta da Lia. [Verificação do ajuste](docs/verification-v0111.md).

A 0.11 corrige o encaminhamento de sintomas ditos ou digitados à Lia. Relatos afirmativos identificados pelas regras do serviço geram um alerta com a fala literal no Pro, sem exigir um cenário pronto ou outra confirmação. A Lia apresenta orientação para buscar avaliação e só anuncia o registro após o recibo do servidor. O cadastro oncológico autorizado acompanha o Perfil e a conversa. Falha do TTS mantém a escuta e as respostas escritas. Detalhes e limites em [verification-v011.md](docs/verification-v011.md).

Aplicativo Android para apresentar o OncoFlow com três perfis fictícios, jornada, agenda e a Lia por texto e voz. Na 0.8, a Lia também executa tarefas no aplicativo: abre telas e documentos, consulta informações, ajusta preferências e prepara registros e pedidos simulados com confirmação. O APK faz chamadas diretas à OpenAI e à ElevenLabs. O modo independente não depende de servidor próprio; o modo conectado consulta e grava no servidor do painel. A Lia ao vivo precisa de internet, chaves válidas e créditos disponíveis nos provedores.

A 0.9.0 (versionCode 10) compacta o cabeçalho e os cartões do Início para aproximar **Falar com a Lia** da primeira tela do telefone. A faixa fixa de demonstração foi retirada; os avisos continuam na entrada, no Perfil, na Lia e nos fluxos simulados. O aplicativo passa a oferecer português do Brasil e inglês dos Estados Unidos, incluindo os dados fictícios e a conversa. Na 0.10.0, a integração com o painel Express foi ativada por pareamento temporário por paciente.

## Plataforma conectada

Na entrada ou no Perfil, escolha **Conectar ao hospital**, informe o endereço do painel e o código gerado para o paciente em **Aplicativo do paciente → Gerar código de pareamento**. Para o servidor HTTP na mesma rede Wi-Fi, marque **Rede local de demonstração (HTTP)**; ao usar HTTPS, deixe a opção desmarcada. O link HTTPS temporário autorizado para a apresentação é informado separadamente ao usuário; não há hospedagem permanente configurada no código. O guia completo está em `docs/connected-demo.md` na raiz do repositório integrado.

Depois do pareamento, app e Lia usam a identidade e os dados do servidor: agenda, jornada, documentos publicados, registros, pedidos, mensagens e preferências. As escritas só informam sucesso após confirmação do servidor. Assumir/concluir no Pro muda o status no app; a resposta escrita pela equipe aparece em Mensagens da equipe. Pedir reagendamento não altera o horário; a equipe precisa editar o compromisso. Documento interno não vira publicação automaticamente.

O servidor da rede precisa ficar acessível enquanto os dois trocam dados. A sessão pareada fica em memória; reiniciar o app ou o servidor exige novo código. Dados confirmados persistem no servidor. A troca de paciente e a desconexão abortam atualizações antigas. **Explorar demonstração** mantém os três perfis locais anteriores. Todo o conjunto continua fictício, sem serviço de atendimento clínico real.

O código autocontido do app está em `patient-app/` no repositório do painel. A execução conjunta usa `npm run build:platform` e `npm run start:platform` na raiz desse repositório. Verificação desta entrega: [docs/verification-v011.md](docs/verification-v011.md). As seções sobre versões anteriores abaixo são histórico e descrevem também o modo independente.

## O que esta versão permite apresentar

- Entrada com Marina, João ou Helena; Início, Jornada, Lia, Agenda e Perfil.
- Idioma selecionável na entrada ou em **Perfil → Idioma do aplicativo**, salvo no aparelho. Português é o padrão; textos, datas, documentos, cenários e controles acompanham a seleção. A agenda mantém o horário de Brasília nos dois idiomas.
- Documentos fictícios, detalhes de consultas e pedidos simulados de contato/reagendamento.
- Acesso à voz em um toque pelo Início ou pela navegação principal, após o aceite inicial lembrado no aparelho. Abrir o app sozinho não ativa o microfone.
- Tarefas por texto ou voz: consultar agenda, jornada, documentos, pedidos e bem-estar; abrir telas, consultas e documentos; ajustar letras, velocidade e explicações.
- Confirmação por fala ou botões antes de salvar bem-estar ou criar pedidos fictícios. A resposta informa o resultado da execução local; reagendamento não altera a consulta e contato não avisa uma equipe real.
- Chamada que continua durante a navegação feita pela Lia, com uma barra para voltar à conversa, silenciar o microfone e encerrar.
- Conversa com GPT‑4o, transcrição com `gpt-4o-mini-transcribe` e resposta falada com Sarah, da ElevenLabs, usando `eleven_multilingual_v2`.
- Conversa por voz em tela inteira, com Silero V5 local para confirmar fala antes de abrir o áudio enviado por WebRTC. A OpenAI segmenta e transcreve esse fluxo filtrado; o app envia o texto final ao GPT‑4o e reproduz a resposta com Sarah.
- Saudação automática da Lia quando a conexão fica pronta. A escuta permanece disponível durante a resposta, com interrupção pela fala implementada e cancelamento de eco solicitado ao aparelho.
- Símbolo central que acompanha o áudio da Lia e indicação de entrada que fica em zero quando o filtro não confirma fala. O botão CC mostra parciais da sua fala e o texto da resposta.
- Controles para silenciar/ativar o microfone, concluir um turno com **Terminei de falar**, encerrar e tentar novamente após um erro. A gravação manual com revisão antes do envio continua disponível.
- Explicações curtas ou passo a passo, velocidade da voz e texto ampliável até 200%.
- Cenários de relato, esclarecimento de expressão ambígua, orientação urgente e histórico de alertas simulados.

A voz Sarah sintetiza português e inglês com o modelo multilíngue; sua voz-base é americana. O idioma escolhido também orienta a transcrição e a resposta da Lia. A preferência de linguagem é explícita: o app não infere escolaridade, origem ou condição clínica pela voz.

## Lia ativa na versão 0.9.0

A Lia usa o contexto atual do perfil e das preferências para propor uma tarefa. O aplicativo valida a proposta e executa somente ações disponíveis. Registros e pedidos precisam de confirmação local, válida por até dois minutos; uma resposta ambígua, uma negativa ou uma mudança de assunto não confirma a ação anterior. Em inglês, **“yes, confirm”** e **“no, cancel”** têm a mesma função. Encerrar a sessão, trocar o perfil, reiniciar ou mudar o idioma cancela pendências. Mudar o idioma também interrompe captura, voz e requisições da conversa anterior.

O transporte Silero/WebRTC, GPT‑4o, transcrição e Sarah permanecem. Tocar no símbolo continua sem interromper a resposta nem alterar o microfone; a interrupção pela fala permanece disponível. A verificação da 0.9 passou 226 testes unitários, 58 E2E e 14 JUnit, além dos ensaios de interface e voz em português/inglês no emulador Android com APIs reais. Artefato, hash, evidências e limites estão em [docs/verification-v09.md](docs/verification-v09.md).

Como histórico, [docs/verification-v08.md](docs/verification-v08.md) registra os 162 testes unitários, 48 E2E, 14 JUnit e os ensaios de texto e voz com APIs reais da 0.8 no emulador Android. Esses resultados não substituem a verificação da 0.9. O ajuste anterior permanece documentado em [docs/verification-v071.md](docs/verification-v071.md).

## Visual da versão 0.7

A 0.7 aplica o kit concluído no chat **Criar modelos visuais do aplicativo**, documentado em [`../oncoflow-ui-models/HANDOFF.md`](../oncoflow-ui-models/HANDOFF.md). O tema usa fundo gelo, texto azul-petróleo e ações em petróleo/turquesa. O Início reúne a próxima consulta e quatro atalhos: jornada, bem-estar, agenda e documentos. O bem-estar oferece seis sentimentos, com seleção identificada e registro fictício limitado à sessão.

A Lia usa o orbe SVG do kit e ondas ligadas aos níveis reais do áudio sintetizado e da entrada liberada pelo filtro de fala. A conversa por texto recebeu cabeçalho, balões e ações com a mesma identidade. Legendas, controles de voz, texto ampliado até 200%, rolagem em telas pequenas e preferência por movimento reduzido foram preservados na adaptação. O fluxo Silero/WebRTC, GPT‑4o e ElevenLabs continua sendo o da versão 0.6; o kit visual não acrescenta dados clínicos nem promessas de atendimento.

## Instalar e apresentar

1. O artefato desta versão é `../output/apk/OncoFlow-Paciente-demo-v0.11.1.apk`. O build e a verificação estão registrados em [docs/verification-v011.md](docs/verification-v011.md). Transfira o APK para o Android e abra o arquivo. Autorize a instalação pelo aplicativo usado para abrir o APK, se o Android solicitar.
2. Abra o OncoFlow, escolha o idioma e um perfil fictício e toque em **Explorar demonstração** ou **Explore demo**. Não há login.
3. Toque em **Falar com a Lia** no Início ou em **Lia** na navegação principal. Na primeira vez, toque em **Entendi, ativar e conversar** e permita o microfone. O aviso informa o processamento de texto e áudio pela OpenAI e ElevenLabs; use somente conteúdo fictício. **Prefiro digitar** permite permanecer no texto, com o aceite necessário antes de enviar mensagens.
4. Nas próximas vezes, o mesmo acesso inicia a chamada diretamente. Aguarde a conexão e a saudação da Lia; então fale naturalmente. Ao terminar a frase, a pausa permite concluir a transcrição e iniciar a resposta, sem revisão nem toque em **Enviar**. Se o turno não terminar, use **Terminei de falar**.
5. A Sarah fala a resposta e o símbolo central acompanha o nível de sua voz. A indicação do microfone acompanha a entrada liberada após confirmação de fala; um ruído rejeitado não acende essa indicação. Use **Mostrar legendas** para ver parciais da sua fala, quando disponíveis, e o texto da Lia. A resposta também permanece na conversa depois de encerrar.
6. Toque em **Silenciar microfone** para interromper a entrada de áudio e descartar uma fala ainda pendente. Uma resposta já aceita continua. **Ativar microfone** retoma a entrada. Durante a resposta, o app permite interromper falando; **Encerrar** finaliza a chamada. Se aparecer um erro, use **Tentar novamente** para abrir uma nova conexão.
7. Experimente **“abra minha agenda”**, **“leia meus documentos”**, **“fale mais devagar”** ou **“registre que estou cansada”**. Para registros e pedidos, responda **“sim, confirmar”** ou **“não, cancelar”**, ou use os botões. Ao abrir uma tela, a Lia continua na barra de chamada; **Conversa** volta à tela inteira.
8. Para o modo manual, encerre a chamada, escreva e toque em **Enviar**, ou use **Gravar mensagem → Concluir gravação**. Nesse modo, confira a transcrição antes de enviar; **Parar voz** interrompe e **Ouvir** repete uma resposta.
9. Em **Perfil**, ou pedindo à Lia, ajuste explicação, velocidade da voz e tamanho do texto. O seletor **Idioma do aplicativo / App language** permite trocar o idioma. Em inglês, experimente **“open my schedule”**, **“read my documents”** ou **“record that I am tired”**. Para conversar somente por texto, desmarque **Ouvir as respostas da Lia** no modo manual.

O modo contínuo mantém a conexão com a OpenAI enquanto o microfone está ativo, inclusive durante a resposta da Lia. Na 0.6, o filtro neural embarcado abre a passagem de áudio após confirmar fala e envia silêncio enquanto fechado. Ele roda localmente, sem baixar modelo de CDN, e não usa o volume sozinho para decidir. O caminho de áudio tem atraso adicional de 850 ms para preservar o começo da frase durante a confirmação; transcrição e resposta ainda acrescentam latência.

O app solicita cancelamento de eco, redução de ruído e ajuste automático de ganho ao WebView. Silero detecta fala, mas não identifica quem está falando: televisão e outras pessoas podem ativá-lo, e o ruído que acompanha a voz não é separado do trecho. A qualidade e a interrupção durante a resposta ainda dependem de validação no aparelho físico. Confira esse comportamento no telefone da apresentação.

O símbolo usa a amplitude do áudio sintetizado, sincronizada com a reprodução. Caso o aparelho não consiga analisar esse áudio, a voz continua funcionando e o símbolo não simula amplitude. As legendas de entrada são parciais da transcrição e podem ser corrigidas pelo provedor; o texto da Lia aparece por resposta, sem sincronização palavra a palavra com a síntese.

O modo manual continua como alternativa quando a conexão ao vivo estiver indisponível. Sua captura tem limite de 30 segundos e watchdog para falha de conclusão. **Concluir gravação** preserva áudio válido sem exigir confirmação do detector local. A transcrição manual precisa ser revisada e enviada pelo usuário. O detector local também foi corrigido para voz mais baixa e ruído residual; ele só decide o fim do turno nos fluxos de captura que habilitam encerramento por pausa.

A navegação feita pela Lia e **Ver aplicativo** mantêm a conversa na barra compacta. Sair manualmente pela navegação, encerrar a chamada, trocar o perfil, mudar o idioma, reiniciar ou colocar o aplicativo em segundo plano interrompe a sessão e cancela pendências. Para conversar novamente, toque no acesso à Lia; o microfone não reabre sozinho ao voltar do segundo plano.

A navegação e os dados fictícios continuam disponíveis sem internet; a conversa com IA, a transcrição e a síntese de voz dependem dos provedores online. O navegador executado por `npm run dev` é uma prévia das telas e cenários, sem IA ao vivo: a integração direta com as APIs é nativa do APK Android.

### Demonstrar orientação urgente e alerta

Na tela Lia, abra **Explorar cenários fictícios** e selecione **Orientação urgente e alerta** (S08). Selecionar o cenário sozinho não cria relato nem alerta.

- Para executar sem microfone, toque em **Executar relato fictício**. A frase inserida pelo roteiro fica identificada como tal.
- Para usar a conversa ou a gravação, marque **Aplicar este cenário à conversa e à voz**. Digite ou fale exatamente: **“Estou com muita falta de ar agora”**. Só frases completas cadastradas correspondem ao roteiro.
- Com esse modo explicitamente ativado, uma transcrição urgente correspondente mostra a orientação e registra o alerta simulado imediatamente, antes do áudio. Na conversa contínua, o turno é enviado automaticamente; na gravação manual, a transcrição continua disponível para correção.
- Para mostrar uma falha, marque **Simular falha no envio do próximo alerta** antes da execução. A orientação permanece visível; o botão de nova tentativa mantém o mesmo alerta.
- Avance o histórico com **Simular recebimento**, **Simular equipe assumindo** e **Simular fechamento**. **Simular ausência de retorno** registra uma escalada sem inventar recebimento.

O modo de roteiro fica desligado inicialmente. Trocar o cenário ou reiniciar os cenários desativa sua aplicação à conversa. Correções criam uma nova versão do relato e preservam alertas anteriores. Nenhum desses estados representa envio, recebimento ou atendimento por profissionais reais.

## Limites do MVP

**Demonstração com dados fictícios — nenhum alerta é enviado a profissionais.** O app não presta atendimento, monitora pacientes, diagnostica nem realiza triagem clínica validada. A gravidade demonstrativa vem de um catálogo de cenários; relatos fora dele ficam sem classificação. A Lia não prescreve nem modifica tratamentos. Os pedidos e alertas da equipe permanecem simulados, e o portal do oncologista não faz parte desta aplicação.

As chamadas de texto, áudio e síntese são reais e podem consumir créditos das APIs. Dados enviados aos provedores seguem as condições deles; o app não promete exclusão ou ausência de retenção nos serviços externos.

Este documento descreve a implementação, não comprova validação física de voz ou interrupção. Confira microfone, alto-falante, volume, pausas e interrupção no aparelho da apresentação. Resultados de testes, build e emulador devem ser consultados no relatório da versão; não se deve inferir teste físico a partir de mocks ou áudio injetado.

## Preparação para integração hospitalar

O contrato proposto e o adaptador REST assíncrono estão documentados em [docs/hospital-integration.md](docs/hospital-integration.md). Essa camada usa escopo autenticado de hospital e paciente, valida respostas e permite cancelamento; os testes usam transporte simulado. O App e o APK continuam usando os dados fictícios locais e não importam nem ativam a camada hospitalar.

Uma conexão real ainda exige backend compatível, autenticação e autorização de pacientes, configuração explícita de origens e adaptação do App para carregamento assíncrono e mudanças de sessão. Informar uma URL não conecta a demonstração. Não há painel médico implementado, comunicação clínica real nem conformidade FHIR comprovada nesta entrega.

## Chaves e construção do APK

Para esta apresentação, o usuário solicitou explicitamente incorporar as chaves ao aplicativo. O Gradle lê `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` e as opções de modelo/voz do `.env` local durante o build e gera campos nativos em `BuildConfig`. Os valores não devem ser copiados para arquivos de código, `public/`, variáveis `VITE_*`, comandos ou logs.

**As chaves ficam incorporadas ao APK e podem ser extraídas.** Restrinja a distribuição deste artefato à apresentação e revogue as chaves depois. Esta arquitetura é uma escolha para o MVP privado e não serve como proteção de credenciais em produção.

`.env` está listado no `.gitignore`; `.env.example` contém apenas o modelo de configuração. Em outra estação, copie `.env.example` para `.env` e preencha as chaves localmente. Modificar o `.env` exige reconstruir e reinstalar o APK para atualizar os valores incorporados. A configuração padrão usa `gpt-4o`, `gpt-4o-mini-transcribe`, `eleven_multilingual_v2` e a voz Sarah (`EXAVITQu4vr4xnSDxMaL`).

Para WebRTC, a integração nativa usa a chave OpenAI incorporada para criar uma credencial efêmera de transcrição; somente essa credencial temporária atravessa a ponte para o WebView e fica em memória. Isso não impede a extração da chave principal do APK. A chave OpenAI também precisa permitir os endpoints Realtime usados para criar a sessão e estabelecer a conexão, além das chamadas de texto e transcrição.

Instale JDK21 e Android SDK36/build-tools36.0.0 e configure `ANDROID_SDK_ROOT` ou `ANDROID_HOME`. Então:

```powershell
npm ci
npm run apk:debug
```

Saída prevista pelo script: `../output/apk/OncoFlow-Paciente-demo-v0.11.1.apk`, assinado para desenvolvimento, e `SHA256SUMS-v0.10.0.txt` no mesmo diretório. Android mínimo 7/API24; a conversa também depende de Android System WebView compatível com WebRTC, AudioWorklet e WebAssembly. Detalhes em [docs/android-build.md](docs/android-build.md), decisões de voz preservadas em [docs/implementation-v06.md](docs/implementation-v06.md) e estado das verificações em [docs/verification-v09.md](docs/verification-v09.md). Não é uma versão publicada em loja. As verificações [0.8](docs/verification-v08.md), [0.7.1](docs/verification-v071.md), [0.7.0](docs/verification-v07.md), [0.6](docs/verification-v06.md), [0.5](docs/verification-v05.md), [0.4](docs/verification-v04.md), [0.3](docs/verification-v03.md) e [0.2](docs/verification-v02.md) permanecem como histórico.

`npm run dev` e `npm run build` preparam automaticamente os assets do detector em `public/vad/`: modelo Silero V5, AudioWorklet e runtime ONNX, com licenças. Se essa preparação ou a inicialização local falhar, a chamada informa erro; não libera o microfone bruto como substituição silenciosa. O detector funciona localmente, mas a conversa com os provedores continua exigindo internet.

## Desenvolvimento e verificações

Requisitos: Node >=22.12.0 e npm. Para abrir a prévia web:

```powershell
npm run dev
```

Para verificar o projeto:

```powershell
npm test
npm run typecheck
npm run test:e2e
npm run build
```

Na primeira execução dos testes E2E: `npx playwright install chromium`. Testes com provedores simulados verificam os fluxos, mas não comprovam gravação, transcrição ou reprodução em aparelho físico. Consulte o relatório da versão para distinguir o que foi efetivamente executado.

A rodada da 0.9 foi concluída: [docs/verification-v09.md](docs/verification-v09.md) identifica o APK, os testes, os ensaios nativos e os limites. O relatório [docs/verification-v08.md](docs/verification-v08.md) preserva separadamente as evidências históricas da 0.8.

## Dados e reinício

Data demonstrativa fixa: 31/10/2026, horário de Brasília. A agenda de novembro não se desloca com o relógio do aparelho. A conversa, os relatos e os pedidos ficam na memória da sessão. Recarregar ou encerrar o processo reinicia esses dados; minimizar pode preservar os dados enquanto o processo estiver vivo. Captura, reprodução, requisições e confirmações pendentes são interrompidas ao encerrar a chamada, sair manualmente da sessão ou colocar o app em segundo plano. A navegação assistida preserva a chamada.

**Perfil → Reiniciar demonstração** limpa a sessão. Preferências não clínicas de interface, idioma e o aceite da versão atual do aviso da Lia permanecem em localStorage. O aceite não guarda conversa nem autoriza ativação automática do microfone ao abrir o app. O minipainel permite reiniciar apenas os cenários e limpar seu histórico simulado. Nenhum banco de prontuário é utilizado.

## Organização

- `shared/contracts.ts`: contratos do domínio; `shared/liaActions.ts`: ações permitidas e validação; `src/demo/fixtures.ts`: conteúdo fictício.
- `src/app/`: sessão, navegação, telas, identidade visual e executor local `liaAppBridge.ts`.
- `src/i18n/`: seleção persistida de idioma, traduções reativas, datas e conteúdo fictício localizado.
- `shared/hospitalContracts.ts` e `src/integrations/`: contrato proposto e adaptador hospitalar assíncrono, sem ativação no App; detalhes e trabalho futuro em `docs/hospital-integration.md`.
- `src/features/lia/`: conversa em tela inteira, barra compacta, confirmação de ações, contexto atual, símbolo reativo, legendas, modo manual e revisão de transcrição.
- `src/features/voice/`: filtro neural de fala, entrada WebRTC, eventos de transcrição, controller da conversa contínua, captura manual, detector local de pausas e reprodução com medição de amplitude; `src/adapters/liaProvider.ts`: ponte com os plugins nativos.
- `src/features/safety/`: catálogo, correspondência determinística e eventos simulados.
- `android/`: plugins de captura/provedores, permissões e build Gradle.
- `tests/`: verificações unitárias e de navegação; `docs/`: decisões, roteiro e evidências.

Logo, ícones e Manrope foram reutilizados do kit local. Licença da fonte em `public/brand/OFL.txt`. O plano original está em `../docs/superpowers/plans/2026-10-31-oncoflow-paciente-demo.md`; a decisão posterior de chamadas diretas no APK substitui a proposta inicial de backend apenas neste MVP.
