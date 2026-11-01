# Verificação da plataforma conectada

Entrega de 31/10/2026: app Android 0.11.1 (versionCode 13), OncoFlow Pro e API compartilhada de demonstração.

O mute foi corrigido e verificado em [verification-v0111.md](../patient-app/docs/verification-v0111.md). A integração oncológica, os resultados completos e os limites estão em [verification-v011.md](../patient-app/docs/verification-v011.md). O [guia de execução](connected-demo.md) contém a instalação, o pareamento, o armazenamento persistente e a preparação para hospedagem.

Foram verificados o envio de bem-estar e pedidos pelo app/Lia, atendimento assumido/concluído no Pro, mensagens nos dois sentidos, edição de agenda/preparo e jornada, publicação explícita de documentos, preferências, isolamento por paciente, idempotência e restauração após reinício. Os ensaios usaram apenas dados fictícios.

Comandos de verificação reproduzíveis na raiz:

```sh
npm run lint
npm run test:integration
npm run test:panel
npm run test:platform
npm run build:platform
npm run test:platform:smoke
npm --prefix patient-app test
npm --prefix patient-app run test:e2e
```

Depois de iniciar a plataforma em uma porta reservada para o teste, o ensaio dos formulários do Pro pode ser executado com `PANEL_TEST_URL` apontando para esse endereço e `node tests/panel-browser.mjs`. Ele modifica apenas dados fictícios. O teste Android exige JDK/SDK próprios, o APK instalado e as configurações privadas da demonstração.
