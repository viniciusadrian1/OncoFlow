---
name: oncoflow-arquitetura
description: Arquitetura, modelo de domínio e convenções de código do OncoFlow (FastAPI + PostgreSQL + React) — uma plataforma com serviços e dados compartilhados e duas experiências distintas (OncoFlow Pro web e OncoFlow Paciente mobile/PWA), entidades (instituição, paciente, cuidador e delegação, jornada, etapa, tarefa, solicitação, lembrete, documento, consulta, item extraído, check-in e revisão, consentimento, auditoria), máquinas de estado, contratos de API separados para Pro e Paciente, controle de acesso por perfil/instituição/equipe/finalidade, migrações, testes e definição de pronto. Use sempre que for criar ou alterar backend, banco, endpoint, schema, migração, regra de negócio, indicadores ou testes do OncoFlow, ou quando o pedido for "implementar a feature X", "criar a tabela", "montar a API", "estruturar o projeto", "como modelar etapas/tarefas/check-ins" — mesmo que não cite o OncoFlow pelo nome.
---

# OncoFlow — arquitetura e domínio

O OncoFlow é uma **plataforma de coordenação da jornada oncológica**: conecta informações, necessidades,
tarefas e próximos passos. Decisão do produto: **uma única plataforma, com serviços e dados compartilhados,
e duas experiências de interface distintas**. Não são dois produtos independentes, e também não é a mesma
tela adaptada para públicos diferentes.

| Experiência | Público | Formato |
|---|---|---|
| **OncoFlow Pro** | Médicos, enfermagem, navegação, gestão hospitalar | Portal web: visão operacional, pacientes, tarefas, consultas, check-ins, indicadores, ferramentas de IA |
| **OncoFlow Paciente** | Pacientes e familiares ou cuidadores autorizados | App mobile: jornada, agenda, documentos, check-ins, suporte, assistente por voz (Lia) |
| **Camada de inteligência** | As duas, conforme permissões | Extração e organização de informação, busca contextual, automação controlada de tarefas |

O código precisa tornar os erros perigosos impossíveis por construção: IA vazando para o paciente, hipótese
virando fato, ação dada como feita sem ter sido, transição de estado sem rastro, cuidador vendo mais do que
foi autorizado.

## Código atual do MVP (base IRIS)

O MVP da demo **não** usa ainda o stack abaixo. Ele parte do protótipo IRIS do time (decisão de 31/10/2026):

| Parte | Onde | Observação |
|---|---|---|
| Servidor | `server.ts` + `server/` (Express, TypeScript) | Estado em memória (`server/estado.ts`), reset em `POST /api/demo/reset` |
| Rotas | `server/rotas.ts` | `/api/pro/*` (header de demo `x-demo-usuario`) e `/api/paciente/*` (`Bearer demo-maria`) |
| Visões | `server/visoes.ts` | A do paciente é lista explícita de campos; mensagens com `visivelPaciente: false` nunca saem |
| Lia | `server/lia.ts` | Regras locais + confirmação em duas fases + quatro status + `verificarAfirmacoes` |
| Urgência | `server/urgencia.ts` | Termos vêm de `server/configServico.ts`; vira hipótese para a equipe |
| Pendências | `Pendencia` em `src/types.ts` | Origem, estado, responsável, prazo do serviço, desfecho obrigatório |
| Front | `src/App.tsx` (Pro, base IRIS) e `src/paciente/` (Paciente) | Um build Vite, carregamento separado por rota |

Ainda não existem no MVP: copiloto de consulta, banco de dados, autenticação real, cuidador, auditoria
persistente. Ao portar para o stack-alvo, mantenha os mesmos contratos de visão e as mesmas regras.

## Arquitetura-alvo

O stack, a estrutura e as convenções abaixo valem para depois da demo.

## Stack

| Camada | Escolha | Observação |
|---|---|---|
| Backend | Python 3.12+ (imagem Docker em 3.14), FastAPI, Pydantic v2, SQLAlchemy 2.1 (async, asyncpg), Alembic | Regras na camada `service`, nunca no router. Versões fixadas em `backend/requirements.txt` |
| Banco | PostgreSQL 16 | `uuid` como PK, `timestamptz` em UTC, enums do Postgres para estados |
| Front Pro | React 18 + TypeScript, Vite, React Router, TanStack Query, Tailwind, Recharts | Desktop ≥ 1280 px |
| Front Paciente | React 18 + TypeScript, Vite, `vite-plugin-pwa`, Tailwind | Mobile-first, instalável; app nativo só depois do piloto |
| IA | Claude via SDK `anthropic`, em `app/ia/` (copiloto) e `app/lia/` (assistente) | Ver `oncoflow-copiloto-ia` e `oncoflow-assistente-lia` |
| Voz | Interfaces `Transcritor` (consulta), `ReconhecedorFala` e `SintetizadorVoz` (Lia) | Implementação de fixture para demo e testes |
| Automação | Tabela `notificacao` (outbox) + worker simples | n8n só se a arquitetura do hospital aprovar |
| Infra local | `docker compose` (db, backend, pro, paciente) | A demo roda 100% local |

**Por que dois apps de front, e não um com duas rotas:** o paciente precisa de manifest e service worker
próprios (PWA instalável), de um bundle leve em rede móvel (sem gráficos e tabelas do Pro) e de um deploy
independente. O código comum fica num pacote compartilhado do workspace, mas **só primitivas** (tokens,
botão, cliente HTTP, `SeloProveniencia`, `AvisoUrgencia`): nunca uma tela compartilhada.

## Estrutura do repositório

```
backend/
  app/
    main.py  config.py  db.py
    acesso/          # JWT, contexto (usuario, papel, instituicao, delegacao), requer_papel(), requer_escopo()
    dominio/
      instituicoes/ pacientes/ cuidadores/ jornada/ agenda/ tarefas/ solicitacoes/ lembretes/
      documentos/ consultas/ checkins/ consentimentos/ orientacoes/ indicadores/
        models.py  schemas_pro.py  schemas_paciente.py  service.py  router_pro.py  router_paciente.py
    ia/              # copiloto: transcrição, extração, resumo, verificação de evidência
    lia/             # assistente: ferramentas, confirmação, contexto, verificação de afirmações
    auditoria/       # registrar(evento) — chamado pelos services
    demo/            # seed fictício e reset (só com DEMO_MODE=true)
  alembic/  tests/
frontend/            # npm workspaces
  apps/pro/  apps/paciente/  packages/shared/
fixtures/            # transcrições, extrações, áudios e diálogos fictícios
docker-compose.yml  .env.example  .gitignore
```

Separe `schemas_pro.py` de `schemas_paciente.py` em todo módulo. O schema do paciente é uma lista explícita de
campos permitidos. Reaproveitar o serializer da equipe na rota do paciente é a forma mais comum de vazar nota
interna ou conteúdo de IA não validado.

## Modelo de domínio

As entidades, os campos e as relações estão em `references/modelo-dominio.md`. Leia antes de criar tabela ou
migração. Pontos que mais causam erro:

- **Toda informação importante tem origem, status e responsável** (princípio 3 do produto). Tarefa,
  solicitação, item extraído e revisão de check-in carregam os três explicitamente.
- **Etapa ≠ tarefa ≠ solicitação.** A *etapa* é o marco da jornada que o paciente vê ("Avaliação de
  fertilidade"). A *tarefa* é o trabalho da equipe, sempre com responsável e prazo ("agendar consulta com
  reprodução humana"). A *solicitação* é um pedido do paciente ou cuidador (reagendamento, contato, dúvida),
  que a equipe analisa e pode transformar em tarefa.
- **Tarefa de navegação só nasce de item aprovado** ou de ação manual da equipe. O prazo padrão vem da
  configuração do serviço (`prazo_padrao_horas` por tipo), é editável pelo profissional e **nunca é definido
  pela IA**.
- **Texto original da IA é imutável.** Ao validar, guarde `texto_validado` e mantenha `texto_ia`, junto com
  quem validou e quando.
- **Check-in é imutável.** Correção gera nova versão (`substitui_id`). O status de revisão fica em
  `revisao_checkin`, criada quando uma `regra_revisao` do serviço exige revisão.
- **Regras de revisão são dados.** O hospital define quais respostas exigem revisão, quem recebe e em quanto
  tempo. O seed traz regras com `exemplo = true` e "critério ilustrativo — a definir com o serviço". Nunca
  escreva um limiar clínico em `if`.
- **Multi-instituição desde o início:** toda tabela de dado de paciente tem `instituicao_id`, e toda consulta
  filtra por ela no `service`. O acesso é por perfil, instituição, equipe e finalidade.

## Máquinas de estado

Implemente cada uma como uma tabela de transições no `service` (`TRANSICOES: dict[Estado, set[Estado]]`).
Transição inválida retorna **409**. Toda transição chama `auditoria.registrar(...)` com ator, estado anterior,
estado novo e motivo, na mesma transação.

| Entidade | Estados e transições | Regras |
|---|---|---|
| `EtapaJornada` | `futura → aguardando → proxima → em_andamento → concluida`; não concluída `→ cancelada` | Pode avançar pulando estados, mas não sai de `concluida`. Etapa vinda da IA só nasce após aprovação. |
| `Tarefa` | `aberta → em_andamento → concluida`; `aberta/em_andamento → cancelada` (motivo) | **"Vencida" é derivada** (`prazo < agora` e não fechada), nunca gravada. |
| `Solicitacao` | `registrada → em_analise → atendida / recusada`; `registrada → cancelada_pelo_paciente` | Tipos: `reagendamento`, `contato_equipe`, `duvida`, `relato`. A equipe pode gerar tarefa a partir dela. **O paciente vê o estado real**: "registrada" não é "remarcada". |
| `ItemExtraido` | `pendente_validacao → confirmado / rejeitado` | Só `confirmado` gera tarefa ou etapa, ou pode ser `visivel_paciente`. Rejeitar exige motivo. |
| `ResumoConsulta` | `rascunho_ia → em_revisao → aprovado` | Só `aprovado` aparece fora da revisão. |
| `RevisaoCheckin` | `aguardando_revisao → em_revisao → revisado` | `revisado` exige desfecho (`sem_acao_necessaria`, `contato_realizado`, `encaminhado`). Atraso é derivado do prazo da regra. |
| `DelegacaoAcesso` | `convidada → ativa → revogada`; `convidada → expirada` | Concedida pelo paciente, com escopos granulares. A revogação vale na hora (o token do cuidador perde o escopo). |
| `Consentimento` | `ativo → revogado` | A revogação de áudio interrompe a gravação em curso. |

O progresso exibido ao paciente é `etapas concluídas / etapas cadastradas`, com o rótulo "Etapas cadastradas
concluídas". Não chame isso de progresso do tratamento.

## Convenções de API

- Prefixos `/api/pro/...` (papéis da equipe e gestão) e `/api/paciente/...` (paciente ou cuidador).
- **Na rota do paciente, o `paciente_id` vem do token**: do próprio paciente, ou da delegação ativa do
  cuidador. Nunca da URL ou do corpo.
- Cuidador: `Depends(requer_escopo("agenda:ler"))`. Os escopos da delegação são verificados em cada
  endpoint do paciente. Lista de escopos em `oncoflow-seguranca-lgpd`.
- Equipe: `Depends(requer_papel("medico", "enfermagem"))` + vínculo com o paciente + mesma instituição.
- Datas em ISO 8601 com fuso. Grave em UTC e exiba em `America/Sao_Paulo`.
- Erros: `{"erro": "<codigo>", "mensagem": "<texto em PT-BR>"}`. Listas com `limite`/`cursor`.
- Leitura de conteúdo sensível (transcrição, relato, documento) também gera evento de auditoria.
- Endpoints usados pela Lia são os mesmos do app (`/api/paciente/*`). A Lia não tem rota privilegiada.

## Indicadores

As definições e o SQL de referência estão em `references/indicadores.md`. São métricas de processo, medidas no
piloto, nunca promessas. Exiba o período, o denominador e o selo "dados fictícios" no MVP.

## Testes

- `pytest` contra o Postgres do compose (sem SQLite: os enums e o `timestamptz` se comportam diferente).
- Para cada máquina de estado, um teste parametrizado com transições válidas e inválidas.
- Matriz de permissões: teste parametrizado papel/escopo × endpoint (200, 403 ou 404), incluindo cuidador com
  e sem cada escopo e usuário de outra instituição.
- Teste de não vazamento: item de IA `pendente_validacao` nunca é retornado por `/api/paciente/*`.
- IA e voz sempre em modo fixture nos testes. Nada de rede.
- Frontend: Vitest nos componentes de segurança (`SeloProveniencia`, `AvisoUrgencia`, confirmação de ação,
  `OrbeLia` sem animação). Playwright no fluxo da demo (ver `oncoflow-demo-hackathon`).

## Definição de pronto de uma feature

1. Migração Alembic reversível, com `instituicao_id` em dado de paciente.
2. Schema Pro e schema Paciente separados, com os campos do paciente explícitos.
3. Transições pela tabela, com 409 e auditoria.
4. Permissões por papel, instituição, vínculo e escopo de delegação, testadas.
5. Conteúdo de IA com proveniência e status, invisível ao paciente antes da validação.
6. Ação disponível no visual também disponível por voz, quando for seguro (princípio 1), ou justificativa de
   por que não.
7. Seed fictício atualizado se a demo usa a feature.
8. Checklist da `oncoflow-seguranca-lgpd` revisado.
