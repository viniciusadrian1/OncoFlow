# Verificação da preparação Vercel — 31/10/2026

Este relatório registra a preparação inicial, anterior à separação por Services. A configuração atual de serviços e builds está em [vercel.md](vercel.md).

Repositório de destino: `viniciusadrian1/OncoFlow`, branch `main`. App do paciente: 0.12.0, versionCode 14.

## Resultado verificado

O build reúne o painel em `/`, o paciente em `/app/` e a API em uma função Node. A saída pública `dist-static/` contém somente os frontends, sem bundle/mapas do servidor ou credenciais. A fonte canônica do paciente é `patient-app/`.

O fluxo principal oferece **Entrar no app**, sem endereço ou código. A web valida o serviço na própria origem. O APK consulta metadados públicos de publicação Production do repositório, valida a API e guarda somente a URL pública. O servidor fornece uma sessão restrita ao paciente fictício; o token permanece na memória do app. O pareamento manual continua nas opções avançadas.

Na nuvem, o estado completo fica em um snapshot Redis, com exclusão mútua por processo e bloqueio distribuído com lease. O sucesso só sai após o commit atômico; falhas retornam 503. Sessões, propostas e idempotência sobrevivem a novas instâncias. Não há fallback silencioso para memória ou arquivo na função.

## Comandos e resultados

| Verificação | Resultado |
|---|---|
| `npm run lint` | Passou |
| `npm run test:integration` | 23 testes passaram |
| `npm run test:panel` | 2 testes passaram |
| `npm run test:platform` | 2 testes passaram |
| `npm run test:vercel` | 3 testes passaram |
| `npm run test:serverless` | 13 testes passaram |
| `npm --prefix patient-app run typecheck` | Passou |
| `npm --prefix patient-app test` | 281 testes passaram |
| `npm --prefix patient-app run test:e2e` | 73 testes passaram; após os últimos ajustes de texto, os 2 testes de entrada automática passaram novamente |
| `npm run build:vercel` | Passou; 29 arquivos públicos |
| `npm run test:platform:smoke` | Passou |
| `powershell -File patient-app/scripts/build-android.ps1` | Build Android e verificação da assinatura v2 passaram; pacote `br.com.oncoflow.paciente`, versão 0.12.0/code14, Android mínimo API 24 |

O smoke usa uma porta efêmera e arquivo de estado isolado. Verifica os assets dos dois frontends e o percurso real pela API local: entrada automática → identidade do cadastro → relato fictício de febre/vômitos → sinal e mensagem no Pro → resposta profissional → mensagem no paciente. Repete a mesma operação para verificar que não cria outro sinal e mantém o pareamento avançado compatível.

Os testes serverless usam o SDK Upstash real contra um emulador REST isolado. Cobrem novas instâncias, concorrência, sessão por paciente, confirmação pendente, commit antes da resposta, falhas de leitura/gravação, resposta perdida após commit, lease substituído, reset e os corpos já processados pela Vercel. O emulador não comprova o funcionamento do serviço Redis hospedado.

## O que ainda depende da publicação

Nenhuma conta, integração paga ou implantação Vercel foi criada. O proprietário deve importar o repositório, conectar Redis persistente e publicar Production, conforme [o guia de publicação](vercel.md). O registro público de deployment ou a configuração pública opcional do desenvolvedor precisa apontar ao domínio real. Não há domínio inventado ou túnel fixado no código.

A execução real na Vercel/Node 24, a persistência no Upstash hospedado e a descoberta desse domínio no smartphone só podem ser conferidas após essa configuração. O snapshot da demonstração tem limite de 1 MiB; contenção ou indisponibilidade do Redis podem gerar 503 com possibilidade de nova tentativa.

A voz continua no APK Android, com as chaves privadas locais autorizadas para a apresentação. A web é uma prévia conectada, sem chamadas aos fornecedores de voz. Esta etapa não repetiu chamadas pagas à OpenAI/ElevenLabs nem testes no smartphone físico. O APK e as chaves ficam fora do Git.

APK local exportado para `output/apk/OncoFlow-Paciente-demo-v0.12.0.apk`. SHA-256: `9fa9912dfbd8466df688f0bcbc37a29bf9b8c2644dfdc98207785b489c9fda90`. Esse artefato privado não integra o conteúdo do repositório público.
