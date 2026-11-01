# OncoFlow

Plataforma de coordenação da jornada oncológica: **cada etapa do cuidado, conectada.** MVP para o MIT Hacking
Medicine (trilha de Oncologia), só com **dados fictícios**.

As regras do produto e as decisões de arquitetura estão em [CLAUDE.md](CLAUDE.md) e nas skills em
`.claude/skills/oncoflow-*`.

O repositório tem dois projetos lado a lado:

| Projeto | Onde | Para quê |
|---|---|---|
| **MVP da demo** (base IRIS) | raiz: `server.ts`, `server/`, `src/` | O que roda na apresentação. Node/Express, estado compartilhado e persistência local |
| **Arquitetura-alvo** | `backend/` + `frontend/` | Versão com FastAPI, PostgreSQL, autenticação e auditoria, em construção |

Outros diretórios: `oncoflow-casa/` (protótipo com painel web e ESP32), `fixtures/` (dados fictícios),
`outputs/` (capturas da demo) e `work/` (scripts de verificação).

---

## Plataforma conectada: Pro + aplicativo Android

O código do aplicativo existente está incluído em `patient-app/`. Para preparar as duas experiências e a
API de demonstração no mesmo servidor (Node.js 22.12+):

```sh
npm ci
npm run build:platform
npm run start:platform
```

Abra o Pro em `http://localhost:3000/` e o app web em `http://localhost:3000/app/`. Para o Android, gere o
código em **Aplicativo do paciente**, use o endereço do computador na mesma rede e marque a opção de rede
local para HTTP. O terminal informa os IPs disponíveis. No Windows, também é possível executar
`powershell -ExecutionPolicy Bypass -File .\Start-OncoFlow.ps1 -Build`.

Os dados fictícios ficam em arquivo local persistente, ignorado pelo Git. O servidor precisa permanecer
aberto durante a demonstração. O [guia da plataforma conectada](docs/connected-demo.md) detalha pareamento,
trocas nos dois sentidos, persistência, atualização do código e Docker com volume. Nenhuma hospedagem
pública é criada por esses comandos.

## MVP da demo (raiz)

Uma plataforma, duas experiências sobre o mesmo servidor:

| Experiência | Endereço | Origem |
|---|---|---|
| **OncoFlow Pro** (equipe) | `http://localhost:3000/` | Painel do protótipo IRIS, adaptado às regras do OncoFlow |
| **OncoFlow Paciente** | `http://localhost:3000/paciente` | App do conceito OncoFlow, com a assistente Lia |

### Rodar

```bash
npm install
npm run dev
```

Abra o Pro numa aba e o app do paciente em outra (ou no celular, na mesma rede). Os dois leem o
mesmo estado no servidor e se atualizam a cada 2 segundos. O menu do usuário tem **Reiniciar dados da demo**.

A transcrição de voz usa o Gemini e precisa de `GEMINI_API_KEY` (veja `.env.example`). Sem a chave,
a Lia e o check-in funcionam por texto e pelos chips de sugestão.

### Roteiro rápido

1. Paciente: **Falar com a Lia** → "Quando é minha próxima consulta?" → aceitar o lembrete.
2. Paciente: "Hoje estou muito cansada e preocupada com o trabalho." → **Registrar check-in**.
3. Paciente: "Quero falar com minha enfermeira." → **Pedir contato**.
4. Equipe (Enf. Rodrigo): as pendências aparecem com origem, fala literal, prazo do serviço e
   responsável. Na aba **Comunicação** do paciente, **Assumir conversa** e responder; o app da paciente
   mostra quem está atendendo.

### O que mudou em relação ao IRIS

- A IA não responde mais sobre sintomas nem remédios. A Lia só informa o que está no sistema,
  organiza e encaminha, sempre com um de quatro status: consultado, registrado, encaminhado ou
  confirmado. Ações de escrita pedem confirmação.
- O alarme por palavra-chave virou **hipótese do sistema** para a equipe revisar. A lista de
  termos, os prazos e as regras de revisão são dados do serviço em `server/configServico.ts`.
- O estado saiu do React e foi para o servidor (`server/estado.ts`), compartilhado pelas duas
  experiências. O simulador de WhatsApp deu lugar ao app do paciente.
- Ficaram do IRIS: conversas com "Assumir conversa", retorno automático da assistente após
  20 minutos sem atividade do profissional, plano terapêutico com upload, videochamada por link.

### Testes

```bash
npm run lint && npm run build
```

---

## Arquitetura-alvo (`backend/` + `frontend/`)

- **OncoFlow Pro** (`frontend/apps/pro`, porta 5173): portal web da equipe.
- **OncoFlow Paciente** (`frontend/apps/paciente`, porta 5174): app mobile-first do paciente.
- **API** (`backend/`, porta 8000): FastAPI + PostgreSQL.

### Rodar localmente

Requisitos: Docker Desktop, Python 3.12+ e Node 20+.

```bash
cp .env.example .env        # preencha POSTGRES_PASSWORD, JWT_SEGREDO e DEMO_SENHA
docker compose up -d db     # Postgres 16 (cria também o banco oncoflow_teste)
```

Backend:

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # no Linux/macOS: .venv/bin/pip
.venv/Scripts/alembic upgrade head
.venv/Scripts/uvicorn app.main:app --port 8000
```

Frontend (em outro terminal):

```bash
cd frontend
npm install
npm run dev:pro        # http://localhost:5173
npm run dev:paciente   # http://localhost:5174
```

Ou tudo em contêineres: `docker compose up --build`.

Com `DEMO_MODE=true`, a API popula o banco na primeira subida e os dois apps mostram uma barra para trocar de
usuário fictício e para restaurar os dados da demo. Fora do modo demo, as rotas `/api/demo/*` não existem.

### Testes

```bash
cd backend && .venv/Scripts/pytest -q     # usa o banco oncoflow_teste; desce e sobe todas as migrações
cd frontend && npm run typecheck && npm run build
```

---

## Estrutura

```
server.ts, server/   MVP: Express, estado compartilhado persistido, Lia, regras de sinais, rotas, seed e config do serviço
src/                 MVP: OncoFlow Pro (src/App.tsx, src/components/) e Paciente (src/paciente/)
backend/app/         alvo: acesso, auditoria somente-inserção, domínio, demo
backend/alembic/     alvo: migrações (reversíveis)
frontend/            alvo: apps pro e paciente + packages/shared
fixtures/            transcrições fictícias usadas pelo seed e pelos testes
oncoflow-casa/       protótipo OncoFlow Casa (painel web + firmware ESP32)
```
