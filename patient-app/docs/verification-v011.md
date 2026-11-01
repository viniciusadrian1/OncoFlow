# Verificação — Lia conectada 0.11.0

31/10/2026. Android versionCode 12. Correção dos relatos livres na conversa e inclusão do contexto oncológico do cadastro conectado.

## Comportamento implementado

Antes de chamar o GPT, a Lia envia o texto ou a transcrição final ao serviço autenticado do paciente. A regra configurada no serviço da demonstração identifica relatos afirmativos como “estou com febre e vomitando”. O servidor guarda a fala literal e sua origem e cria uma pendência de sinal no Pro. A orientação para procurar avaliação é apresentada e falada quando o TTS está disponível. O recibo informa alerta registrado, aguardando revisão; não significa que um médico foi avisado por outro canal, leu ou assumiu.

Negação, perguntas educativas, hipóteses, passado e relatos de outra pessoa não viram sintomas atuais do paciente. Uma afirmação atual depois de uma pergunta ou de um relato histórico continua sendo reconhecida. São mecanismos conservadores para esta demonstração, sem atribuição de diagnóstico, gravidade ou prioridade clínica.

Falha de rede não produz confirmação falsa. Repetir a mesma operação usa a mesma chave, inclusive após trocar o idioma. Uma sessão nova gera outra chave: um novo episódio idêntico não reutiliza o recibo anterior. O envio de sintomas por texto independe da configuração do GPT/TTS. A indisponibilidade da síntese durante a chamada mantém a escuta e apresenta legendas/resposta escrita.

`summary.careContext` leva diagnóstico resumido, tratamento e ciclo cadastrados, origem e instruções publicadas até o Perfil e o contexto da Lia. Plano terapêutico interno, hipóteses pendentes, credenciais e dados de outros pacientes não entram no contexto. O prompt permite educação geral coerente com o cadastro e proíbe deduzir estágio, imunossupressão, prognóstico, medicação ou tratamento pelo nome do câncer.

## Evidência

- 267 testes unitários do app, em 20 arquivos, passaram.
- 70 E2E passaram, incluindo texto/voz automáticos, ausência de provedor, saldo TTS esgotado com microfone ativo, fonte/contexto, negações, confirmação perdida, idioma e nova sessão. Controles testados com texto 200% em 360 × 640.
- 23 testes HTTP passaram: novo endpoint, isolamento, idempotência, persistência e rollback; exemplos afirmativos e controles PT/EN.
- 19 JUnit passaram: 14 anteriores e cinco de classificação segura do erro de provedor. ElevenLabs 401 `quota_exceeded` é tratado como limite; autenticação real permanece distinta.
- Pro verificado em servidor isolado: alerta chega na página já aberta pelo polling, com paciente, literal, hipótese, estado e responsável; falha/clique duplo ao assumir e desfecho obrigatório ao concluir.
- APK final instalado no emulador: dez verificações passaram pelo HTTPS público. Relato digitado criou exatamente um alerta no paciente correto sem chamar o GPT. GPT-4o real recebeu o diagnóstico de câncer de pulmão cadastrado para esse perfil; a negação não criou outro alerta.
- Mesmo APK: 13 verificações com microfone virtual Android, Silero e STT real passaram. A fala de febre/vômitos chegou ao serviço antes do GPT e gerou alerta; a indisponibilidade do TTS não interrompeu escuta/orientação escrita. O Pro já aberto recebeu a atualização automaticamente e exibiu o literal recebido por voz.
- Após a reposição de saldo, mais 13 verificações passaram no mesmo APK: saudação e orientação efetivamente reproduzidas por Sarah/ElevenLabs, microfone/Silero/STT reais, relato encaminhado antes do GPT e retorno à escuta após o áudio (55,4 s). Uma tentativa anterior teve transcrição incompleta e a Lia pediu esclarecimento; não foi contado como alerta bem-sucedido. O ensaio passou com uma frase fictícia mais explícita, “Lia, eu estou com febre e estou vomitando agora”. Reconhecimento de fala continua sujeito a erros.

Os ensaios não reiniciaram os dados compartilhados da apresentação. Utilizaram apenas conteúdo fictício e perfil separado daquele que o usuário havia conectado. Emulador e dados de teste não constituem validação clínica ou ensaio em smartphone físico.

## Artefato

`OncoFlow-Paciente-demo-v0.11.0.apk`: 10.122.212 bytes. SHA-256:

`2a818d025b6a349fb171514f4f58c4b6696affba4d428a4df03edf96d112a7c0`

Assinatura v2, instalação e abertura conferidas. APK privado com a configuração autorizada pelo usuário; credenciais e binário não entram no repositório.

Evidências locais do workspace: `output/symptoms-unit-final.log`, `symptoms-e2e-final.log`, `symptoms-backend-final.log`, `symptoms-native.log`, `symptoms-voice-pro.log`, `apk/connected-native-v0.11.0.json`, `apk/connected-voice-degraded-native-v0.11.0.json` e `connected/native-voice-pro-v011.json`. Artefatos gerados ficam fora do Git.

## Voz e fontes da orientação

Durante o teste, a ElevenLabs retornou HTTP 401 com `quota_exceeded`; não foi falha da chave OpenAI nem do encaminhamento. Após o usuário informar a reposição, a síntese voltou a responder HTTP 200 e o teste completo com Sarah passou. Os ensaios de voz com e sem reprodução estão separados em `connected-voice-native-v0.11.0.json` e `connected-voice-degraded-native-v0.11.0.json`. A configuração de voz continua a mesma.

O texto de encaminhamento é uma configuração da demonstração, ainda sujeita à validação do serviço. Referências consultadas: [CDC — Fever](https://www.cdc.gov/cancer-preventing-infections/patients/fever.html) e [NCI — Infection and Neutropenia](https://www.cancer.gov/about-cancer/treatment/side-effects/infection). A escolha de protocolo e prioridade cabe à equipe.
