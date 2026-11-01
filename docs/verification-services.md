# Verificação Vercel Services — 31/10/2026

Este relatório registra os testes iniciais de desenvolvimento. Eles não detectaram a ausência da função no pacote de produção do builder Vite. A causa e a correção com Build Output API explícito estão em [verification-production-api.md](verification-production-api.md).

Base: `dc866dc`. O usuário confirmou a divisão em dois serviços e autorizou o envio das alterações à `main` do GitHub. A publicação na Vercel será feita por ele.

## Divisão aprovada

- `app`, raiz `.`: painel Pro e função Node `api/index.ts`; público em `/` e `/api/*`.
- `patient-app`, raiz `patient-app`: cliente web com arquivos sob `/app/`; público nesse prefixo.
- Nenhum serviço exclusivamente interno ou binding: os dois clientes chamam a API pública pelo navegador. `backend/` e `frontend/` são arquitetura futura e ficam fora desta publicação.

Os builds são independentes: `dist-static` contém 10 arquivos públicos do Pro; `patient-app/dist-service` contém 19 arquivos do paciente. O build do APK mantém a base relativa. Bundle e mapas do servidor permanecem fora da saída pública.

## Evidência

| Verificação | Resultado |
|---|---|
| `npm run lint` | Passou |
| `npm run test:integration` | 24 testes passaram |
| `npm run test:serverless` | 13 testes passaram, com SDK Upstash e Redis REST emulado |
| `npm run test:vercel` | 4 testes passaram |
| `npm run test:platform` | 2 testes passaram |
| Build `build:vercel` da raiz | Passou |
| Build `build:vercel` de `patient-app` | Passou, incluindo typecheck |
| `vercel dev --local` com CLI 65.9.0 | Configuração aceita; os dois serviços iniciaram |
| `npm run test:services:smoke -- http://127.0.0.1:42861` | Passou pelo roteador real do CLI e Chromium headless |

O teste Services usou portas 42861–42864 e estado em `test-results/services-dev-state.json`, separados do servidor existente na porta 3000. Verificou redirecionamento `/app`, HTML do paciente, módulos JavaScript, ícone, VAD, descoberta com a URL do gateway, sessão restrita ao paciente, relato idempotente de febre/vômitos no Pro, resposta da equipe e entrada pelo navegador sem URL ou código. A captura local é `test-results/services/patient-connected.png`, ignorada pelo Git. Os processos do teste foram encerrados.

Problemas reproduzidos antes das correções: `framework: null` não é aceito no objeto de serviço; o Vite não lê `PORT` sozinho; a rota com parâmetro opcional não abrangia `/app/` com a barra final; fallbacks SPA capturavam módulos; a API reescrita caía no HTML; o proxy anunciava o Host interno em vez do gateway. Há testes para as rotas, para os fallbacks e para o Host encaminhado local validado.

## Limites

A execução foi local, em Node 22.21.1. O runtime alvo de publicação continua Node 24. Nenhum recurso ou implantação Vercel foi criado; não houve teste com Redis hospedado nem chamadas pagas a provedores de voz. O servidor local de desenvolvimento usa arquivo; a função em produção continua exigindo Redis e mantém commit atômico, idempotência e escopo por paciente. Vercel Services está em Beta.

A definição final de nomes, exposição pública e ausência de bindings foi confirmada pelo usuário. Veja [o JSON](../vercel.json) e [o guia de publicação](vercel.md).
