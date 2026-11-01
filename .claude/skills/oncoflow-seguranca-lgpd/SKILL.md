---
name: oncoflow-seguranca-lgpd
description: Segurança, privacidade e governança do OncoFlow — controle de acesso por perfil, instituição, equipe e finalidade (paciente, cuidador com delegação granular, médico, enfermagem, navegação, gestão), consentimento por finalidade (gravação, transcrição e IA, check-in, assistente de voz, compartilhamento com cuidador), auditoria somente-inserção, minimização, retenção, criptografia, gestão de fornecedores (LLM, STT, TTS), LGPD, aviso de que check-in não é emergência, governança de revisão de check-ins, e checklist de revisão antes de merge. Use sempre que a tarefa tocar autenticação, autorização, quem pode ver o quê, familiar ou cuidador, consentimento, áudio ou voz, logs, dados sensíveis, exportação, retenção, termos, LGPD, ou quando pedirem "revisar o código / o PR", "isso está seguro?", "pode ir para a demo?" no OncoFlow.
---

# OncoFlow — segurança, privacidade e limites

O OncoFlow lida com dado pessoal sensível de saúde (art. 11 da LGPD): relatos de sintomas, preocupações,
áudio de consulta, voz do paciente. No MVP tudo é fictício, mas o código já nasce com os controles que o piloto
vai exigir, porque é aí que juízes e hospital olham primeiro. Esta skill traz a proposta padrão. Onde os
documentos do produto deixam a decisão para o hospital, o item está marcado como **[a validar]**.

## Modelo de acesso: perfil + instituição + equipe + finalidade

1. **Instituição:** o usuário só enxerga dados da própria `instituicao_id` (filtro no `service` e teste
   dedicado).
2. **Perfil (papel):** define o que cada tipo de usuário pode fazer (matriz abaixo).
3. **Equipe:** o profissional só acessa pacientes com quem tem `vinculo_equipe`. Sem vínculo, a resposta é 404,
   para não revelar que o paciente existe.
4. **Finalidade:** cada leitura sensível registra a finalidade (`cuidado`, `navegacao`, `gestao_indicadores`,
   `assistente`) na auditoria. A gestão vê indicadores agregados, não prontuário.

### Matriz de permissões (proposta padrão)

| Recurso | Paciente | Cuidador (por escopo) | Médico | Enfermagem | Navegação | Gestão |
|---|---|---|---|---|---|---|
| Jornada e etapas visíveis | ler | `jornada:ler` | ler/editar | ler/editar | ler/editar | — |
| Agenda e lembretes | ler; criar lembrete | `agenda:ler`, `agenda:lembretes` | ler | ler | ler/editar | — |
| Documentos liberados | ler | `documentos:ler` (não incluso por padrão) | ler/liberar | ler | ler (só títulos) [a validar] | — |
| Solicitações (reagendamento, contato) | criar/ler as próprias | `solicitacoes:criar` | ler/atender | ler/atender | ler/atender | — |
| Tarefas | — | — | ler/criar | ler/criar/atualizar | ler/criar/atualizar | — |
| Transcrição e áudio da consulta | — | — | ler (das próprias consultas) | — [a validar] | — | — |
| Itens extraídos pendentes | — | — | ler/validar/rejeitar | ler | — | — |
| Itens confirmados | os marcados como visíveis | idem, com `jornada:ler` | ler | ler | ler | — |
| Check-in (conteúdo) | criar/ler/corrigir | `checkin:registrar` (registrar em nome); ler só com `checkin:ler` | ler | ler | estado da revisão, sem conteúdo [a validar] | — |
| Revisão de check-in | — | — | ler/revisar | ler/revisar | ler | — |
| Indicadores agregados | — | — | ler | ler | ler | ler |
| Auditoria do próprio dado | ver quem acessou [a validar] | — | — | — | — | — |

A navegação coordena o próximo passo e não precisa da conversa inteira: ela vê tarefas e itens confirmados,
não a transcrição (minimização).

## Familiar ou cuidador autorizado

Pelo documento (seção 8): acesso delegado para apoiar a agenda e a organização, **com autorização explícita,
permissões granulares, possibilidade de revogação e registro de acesso**. Nunca acesso irrestrito automático a
informação clínica.

- Quem concede é o paciente, no app ("Pessoas que me ajudam"): ele escolhe os escopos, um a um, com texto
  claro do que cada um permite. Também pode haver cadastro presencial pela equipe [a validar].
- Escopos: `agenda:ler`, `agenda:lembretes`, `jornada:ler`, `solicitacoes:criar`, `checkin:registrar`,
  `checkin:ler`, `documentos:ler`, `lia:usar`. Padrão sugerido ao convidar: só os dois primeiros.
- O cuidador usa a própria conta (papel `cuidador`) e o token carrega `delegacao_id` + escopos. A Lia, usada
  pelo cuidador, herda exatamente esses escopos.
- Revogar vale na hora. Todo acesso do cuidador vai para a auditoria com `via_delegacao_id`, e o paciente vê
  esses acessos.
- O que o cuidador registra (check-in, solicitação) fica marcado como "registrado por <relação>".

## Consentimento e transparência

- Uma linha de `consentimento` por finalidade: `gravacao_audio_consulta`, `transcricao_e_ia_consulta`,
  `checkin`, `assistente_voz`, `compartilhamento_cuidador`, com `versao_termo`. Mudou o termo? Peça de novo.
- **Gravação da consulta:** consentimento informado do paciente, conforme a política institucional, **e** aviso
  a todos os participantes. É opcional, pode ser pausada e parada, e a revogação interrompe a captura. Sem
  consentimento, a consulta segue normalmente.
- **O app informa quem pode ver cada dado e para quê** (documento, seção 8). Na tela de check-in: "Quem vê:
  sua equipe de enfermagem e seu médico. Para quê: acompanhar como você está entre as consultas." O texto vem
  da configuração da instituição.
- Termos em linguagem simples na primeira camada: finalidade, quem acessa, por quanto tempo e como revogar.
- Perguntas sensíveis do check-in são opcionais e explicam por que são feitas.

## Auditoria

- `evento_auditoria` é somente inserção: o usuário da aplicação no Postgres só tem `INSERT`/`SELECT`. Configure
  isso na migração.
- Registre leitura de transcrição, relato, documento, resumo e itens pendentes, além de toda escrita,
  transição, validação, rejeição, exportação, revogação e ação confirmada pela Lia.
- Registre ids, estados e a finalidade, **nunca o conteúdo** (texto de fala ou relato).

## Minimização, retenção e criptografia

- Colete só o que a funcionalidade usa. CPF, endereço e data de nascimento não entram no MVP.
- Áudio da consulta: retenção configurável (`RETENCAO_AUDIO_DIAS`), com padrão do MVP de descartar após a
  transcrição validada [a validar com o hospital].
- **Voz do paciente com a Lia:** não guardar o áudio por padrão, só a transcrição do comando em
  `interacao_lia`.
- Criptografia em trânsito (TLS) e em repouso (disco ou banco do provedor). Arquivos e áudio só por link
  assinado e com expiração curta.

## Fornecedores (LLM, STT, TTS)

- Enviar dado real de saúde a um provedor de LLM, reconhecimento de fala ou síntese de voz é compartilhamento
  com operador: exige base legal, contrato de tratamento, avaliação de transferência internacional e aprovação
  institucional. **No MVP, só dados fictícios.**
- A Web Speech API do navegador envia áudio a terceiros: aceitável só com dados fictícios.
- Registre cada fornecedor (finalidade, dados enviados, região, retenção do provedor) em
  `docs/fornecedores.md`.
- Pseudonimize antes de cada chamada e envie o mínimo. Prompt ou resposta com conteúdo clínico não vai para
  log, analytics ou ferramenta de erro.

## Limites clínicos, urgência e revisão de check-in

- A IA não diagnostica, não prescreve, não altera tratamento e não decide prioridade clínica.
- **Check-in não é monitoramento em tempo real nem serviço de emergência.** O `AvisoUrgencia` é obrigatório no
  check-in e na Lia, e aparece de imediato se houver termos de urgência. O texto vem da configuração aprovada
  pelo hospital. Enquanto não existir, use um placeholder visível: "[Instruções de urgência a definir pelo
  hospital — ex.: procure o pronto atendimento ou ligue 192]".
- Não sugerir monitoramento contínuo em nenhum texto.
- O hospital define quais respostas exigem revisão, quem recebe, em quanto tempo e como agir
  (`regra_revisao`). O atraso aparece em destaque no Pro. Nenhuma resposta clínica automática ao paciente.

## Segurança técnica básica

- Senhas com bcrypt. JWT de curta duração (15 min) com refresh. Usuários da demo só com `DEMO_MODE=true`.
- CORS restrito aos dois fronts. HTTPS fora do localhost. Segredos só em `.env` (no `.gitignore`) e
  `.env.example` sem valores.
- Rate limit na Lia, no login e na criação de solicitações.
- Endpoints `/api/demo/*` nem são registrados quando `DEMO_MODE` é falso.
- Os tokens de confirmação da Lia são de uso único, expiram em 2 min e ficam vinculados ao usuário.

## Checklist de revisão (antes de cada merge e antes da demo)

Responda cada item com sim, não ou não se aplica, e mostre o trecho de código quando a resposta for "não".

1. Alguma rota `/api/paciente/*` aceita `paciente_id` na URL, query ou corpo?
   → `grep -rn "paciente_id" backend/app/dominio/*/router_paciente.py`
2. Alguma rota do paciente usa um schema `*_pro` ou devolve um model ORM direto?
3. Algum conteúdo de IA com status diferente de `confirmado` ou `aprovado` pode chegar ao paciente ou à Lia?
   Existe teste de não vazamento?
4. Toda consulta a dado de paciente filtra por `instituicao_id`? Há teste com usuário de outra instituição?
5. Os endpoints do paciente verificam o escopo da delegação quando o ator é cuidador? Há teste sem escopo?
6. Toda transição e toda leitura sensível chamam `auditoria.registrar` na mesma transação?
7. Algum `print`, `logger` ou mensagem de erro inclui texto de transcrição, relato, comando de voz, prompt ou
   resposta de LLM?
8. A gravação verifica consentimento ativo no backend (não só no front)?
9. Existe limiar clínico em código (ex.: `if dor >= 7`) em vez de `regra_revisao`?
10. O check-in e a Lia mostram o `AvisoUrgencia` e o "quem pode ver"?
11. Alguma resposta da Lia pode afirmar conclusão sem `status = confirmado` (o `verificar_afirmacoes` está
    ativo e testado)?
12. Algum dado com cara de real (nome completo + data de nascimento, CPF, telefone) em seed, fixture, teste ou
    print?
13. Endpoints de demo desligados quando `DEMO_MODE=false`?
14. Algum texto promete monitoramento, prazo de resposta não configurado, redução de tempo ou melhora de
    desfecho?

Resultado: achados ordenados por gravidade (vazamento entre pacientes, instituições ou para o paciente >
cuidador além do escopo > falta de auditoria ou consentimento > Lia afirmando ação não confirmada > o resto),
cada um com arquivo:linha e a correção.
