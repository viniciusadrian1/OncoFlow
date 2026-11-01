# OncoFlow Paciente 0.13.0 — conexão direta

Android `versionCode 15`, pacote `br.com.oncoflow.paciente`. O build incorpora somente o endereço público
de `platform/mobile-config.json` na configuração web. A entrada nativa valida diretamente o painel em
`https://oncoflow-amber.vercel.app`, mantendo cache e GitHub como alternativas. A web mantém a própria origem.

## Verificações

- 282 testes unitários e typecheck passaram. O teste novo falhou antes da implementação e passou depois,
  exigindo uma conexão nativa direta sem acesso ao GitHub.
- 4 testes E2E de entrada automática e PT-BR/EN-US passaram.
- Build Android e assinatura APK v2 passaram: versão 0.13.0/code15, Android mínimo API24.
- O certificado SHA-256 é igual ao APK 0.11.1, permitindo atualização da instalação anterior.
- O APK exportado foi instalado no emulador Android dedicado e entrou no serviço real em 2,9 segundos.
  Foram verificadas sete leituras autenticadas, todas com HTTP200, dados de Maria e nenhuma chamada ao GitHub.
- O Perfil exibiu 0.13.0, sem campo de código. A configuração nativa da Lia foi reconhecida; os tokens de
  sessão não foram guardados no armazenamento do WebView.

O ensaio não enviou sintomas, não iniciou o microfone e não fez chamadas pagas a LLM, STT ou TTS.
As chaves já autorizadas para o MVP privado continuam no build nativo. APK e chaves ficam fora do Git.

Artefato local: `output/apk/OncoFlow-Paciente-demo-v0.13.0.apk` na raiz do repositório integrado.

SHA-256: `6ddcb2f220e14dcfb495c96bb30b6f9ba2e250c76b68d8957ea15d3de4761028`.

Instale sobre a versão anterior e toque em **Entrar no app**. O teste foi em emulador; a validação no
smartphone físico continua sendo feita pelo usuário.
