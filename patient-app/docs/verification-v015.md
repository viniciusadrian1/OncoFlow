# OncoFlow Paciente 0.15.0 — preservar a fala ao mutar

## Defeito reproduzido

Na versão 0.14.0, o teste nativo falou um relato fictício e clicou em silenciar
100 ms após o fim do áudio bruto, antes do evento remoto de fim de fala. O app
ficou em `muted`, com um início de fala, nenhum fim e nenhuma transcrição.
Não houve envio nem resposta. Isso distingue o defeito de mutar durante uma
resposta já aceita, situação que passou nos testes nativos anteriores.

O transporte descartava o item ainda aberto e limpava o buffer. O controlador
só preservava a transcrição quando já havia recebido o fim remoto da fala.
O filtro local também mantinha 850 ms de áudio em espera, que não podiam ser
descartados no momento do mute.

## Escopo da entrega

- Mute bloqueia nova entrada e preserva o trecho de fala confirmado já captado.
- O processamento aceito e a reprodução da resposta mantêm seus próprios ciclos.
- Transcrição: GPT-4o Transcribe, pt-BR/en-US, redução de ruído e preservação de
  palavras curtas e negações; os testes não estabelecem acurácia clínica.
- Relatos afirmativos como “estou com náusea, febre e vômito agora” passam pela
  regra configurada do serviço antes do modelo e geram sinal no paciente conectado.
- Só o recibo da API permite informar que o painel recebeu o relato. Offline ou
  falha de envio preservam a orientação e informam a ausência de confirmação.
- O painel conectado ao APK é https://oncoflow-amber.vercel.app/.

## Evidência anterior preservada

O APK 0.14.0, com a mesma assinatura, passou em duas verificações por microfone
virtual no Android: mute durante a fala da Lia e mute durante processamento real
do GPT-4o. Foram usados STT e ElevenLabs reais. O relato afirmativo foi transcrito
literalmente, recebeu HTTP 200 e apareceu no resumo de Maria no painel publicado,
como hipótese a revisar pela enfermagem. A frase “não estou com febre e não estou
vomitando” foi preservada, sem criar sinal. Cada verificação passou em 15 checks.

Essa rodada também passou em 291 testes unitários, 42 testes de interface,
29 testes da API, dois testes Java da configuração nativa e dois testes do pacote
serverless.

## Verificação da correção de mute antecipado

Na versão final 0.15.0/code17, o teste nativo passou em 15 verificações em 63.798 ms. O clique
ocorreu em `listening`, ainda sem `speech_stopped` remoto. O microfone permaneceu
silenciado enquanto o app recebeu uma transcrição, registrou o relato por HTTP 200
e reproduziu até o fim a orientação da ElevenLabs. A transcrição continha náusea,
febre e vômito; o ASR omitiu o advérbio final “agora”. Não se afirma transcrição
literal perfeita nem acurácia clínica. O teste usou o microfone virtual do AVD,
sem substituir STT, API de registro ou áudio de resposta por mocks.

As regressões também cobrem captura local antes do primeiro ID remoto, ruído
silenciado antes do ID correto, commit único, fechamento, desmute rápido e
transcrição vazia sem interromper uma resposta aceita. A interface passou nos
44 cenários de conversa, conexão e idioma. Lint/typecheck e assinatura Android
foram conferidos. O teste foi feito em emulador; a validação acústica no smartphone
do apresentador continua necessária.

O commit de contingência no mute espera 1.850 ms (850 ms de buffer local,
600 ms do VAD e margem de 400 ms), dando preferência ao encerramento natural.
O botão de concluir mantém 950 ms. Isso evita antecipar desnecessariamente o
encerramento automático, sem atribuir a omissão do ASR a uma causa comprovada.

Suíte unitária final: 311 testes. Artefato privado, fora do Git:
`output/apk/OncoFlow-Paciente-demo-v0.15.0.apk`.

- SHA-256: `6577a99f82a1aa432ba97c9661ed1052462e3e1230b4bc500ad6d52a293a3686`.
- Certificado de desenvolvimento: `0f988da14a1d40a71fc023bff241345bc1759f1c498e94a61a3fb20ad5610a08`.
- Atualização sobre a instalação anterior, sem desinstalar, passou no AVD.
- Chaves e APK não foram incluídos no repositório; o índice foi verificado.

## Base da orientação de atendimento

A mensagem configurada orienta procurar o serviço de oncologia agora e pronto
atendimento se não conseguir contato, sem aguardar o aplicativo. Não diagnostica,
prescreve ou atribui prioridade clínica. O risco de infecção associado à febre
durante tratamento foi conferido em fontes oficiais em 01/11/2026:

- CDC: https://www.cdc.gov/cancer-preventing-infections/patients/fever.html
- NCI: https://www.cancer.gov/about-cancer/treatment/side-effects/infection

Todo o ensaio usa perfis, falas e registros fictícios. O registro da demonstração
não significa leitura por um profissional nem monitoramento real de emergência.
