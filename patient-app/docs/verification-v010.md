# Verificação — OncoFlow conectado 0.10.0

31/10/2026. Android versionCode 11. Demonstração com dados fictícios, integrada ao MVP Express do OncoFlow Pro.

## Resultado verificado

Pareamento temporário por paciente; agenda, jornada, documentos publicados, mensagens, preferências, registros e pedidos compartilham o servidor do Pro. A Lia usa o contexto conectado e espera o reconhecimento do servidor antes de anunciar uma gravação. Confirmar novamente não duplica a operação. Assumir/concluir no Pro retorna o estado correspondente ao app.

O painel usa a marca, Manrope, cores e componentes visuais do app. A tela inicial preserva o acesso à Lia sem rolagem no tamanho padrão, inclusive conectada em 360 × 640. Português BR e inglês USA continuam disponíveis. Código, token e credenciais não são persistidos no armazenamento web do paciente.

## Evidências desta versão

| Verificação | Resultado |
|---|---|
| Unitários do paciente, 18 arquivos | 252 passaram |
| E2E do paciente, com provedores simulados | 62 passaram, 29,5 s |
| JUnit Android | 14 passaram, zero falhas |
| API HTTP real: escopo, expiração, uso único, idempotência, persistência, revogação, publicação e sinais | 15 passaram |
| API do painel | 2 passaram |
| Empacotamento e exclusão de configurações privadas | 2 passaram |
| Painel no navegador, formulários reais, desktop/celular, PT/EN e publicação rejeitada | passou, sem erros de página |
| Plataforma compilada: iniciador, Pro, /app, assets/VAD e pareamento | passou |
| App web → Pro → app, 10 verificações sem mocks de API | passaram |
| APK instalado no emulador: GPT-4o real, registro/contato confirmados, resposta e agenda do Pro | 10 verificações passaram, 10,7 s |
| Mesmo APK: microfone Android virtual → Silero → STT → GPT-4o → agenda compartilhada → ElevenLabs | 13 verificações passaram, 27,6 s |

Os testes reais usaram somente falas e dados fictícios. A voz de teste pediu à Lia para abrir a agenda; a resposta foi efetivamente reproduzida e a chamada continuou ativa. Os testes de texto confirmaram o registro no servidor, repetição sem duplicação e o retorno do atendimento assumido no painel. O ensaio de voz não representa uma avaliação clínica ou uma validação em smartphone físico.

Relatórios locais desta entrega, na pasta `output` do workspace: `connected-unit-final.log`, `connected-e2e-final.log`, `connected-backend-final.log`, `connected-android-unit-final.log`, `connected-panel-browser-final.log`, `connected-platform-smoke-final.log`, `connected/roundtrip.json`, `apk/connected-native-v0.10.0.json` e `apk/connected-voice-native-v0.10.0.json`. Esses artefatos gerados não fazem parte do código versionado.

## APK

- Arquivo: `OncoFlow-Paciente-demo-v0.10.0.apk`.
- Tamanho: 9.963.304 bytes.
- SHA-256: `8a5dce0990c69c35fabdb56502214f1d86a2ed1c628e355553296de795ed0e35`.
- Assinatura v2 verificada; instalação e abertura no emulador confirmadas.
- As chaves de demonstração permanecem no APK privado autorizado pelo usuário; não foram copiadas para o repositório público.

## Limites da entrega

Sem hospedagem pública configurada. A troca pelo APK utiliza o computador acessível na mesma rede e a opção explícita de HTTP local; endereços públicos exigem HTTPS. O app oferece também a demonstração independente. O reinício do app/servidor exige novo pareamento; o estado confirmado persiste em arquivo no servidor.

Perfis e autenticação do Pro continuam sendo os da demonstração. Regras de termos nas mensagens geram uma hipótese interna de sinal e um aviso autorizado pelo serviço fictício; não definem diagnóstico ou prioridade clínica. Cenários de urgência da conversa com a Lia continuam locais e são identificados como simulações; o compartilhamento de relato com o painel ocorre em Mensagens da equipe. Não há monitoramento de urgência nem serviço médico real.

Dockerfile e Compose foram preparados e sua configuração foi validada. O Docker Engine estava desligado nesta máquina; a imagem não foi construída nem executada. A execução Node da plataforma foi compilada e testada de ponta a ponta.
