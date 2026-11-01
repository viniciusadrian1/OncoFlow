---
name: oncoflow-demo-hackathon
description: Planejamento e execução da demonstração do OncoFlow no MIT Hacking Medicine — ordem de construção e o que cortar quando o tempo apertar, dados fictícios (paciente Maria, câncer de mama, preocupação com fertilidade, outros pacientes para o OncoFlow Pro), roteiro de 3–5 minutos com falas (copiloto → aprovação → tarefa de navegação → app atualizado → Lia consulta a agenda por voz → check-in por voz → equipe vê), modo offline à prova de Wi-Fi com áudio pré-gerado, reset, ensaio automatizado com Playwright, pitch, perguntas difíceis e validação com mentores. Use sempre que falarem em demo, apresentação, pitch, hackathon, jurados, "o que fazer primeiro", "não vai dar tempo", seed, dados de exemplo, ensaio, vídeo de backup ou slides do OncoFlow.
---

# OncoFlow — demo do hackathon

A demo precisa provar **um ciclo integrado com dados fictícios**, sem integração com sistemas hospitalares
reais (documento "Conceito de produto", seção 10). Juízes de hackathon de saúde julgam três coisas: o
problema é real, a solução é viável e ela é segura. O ciclo mostra as duas primeiras; o profissional
aprovando, e a Lia dizendo só o que de fato aconteceu, mostram a terceira. Tudo o que não serve ao ciclo
fica para depois.

O que o MVP precisa mostrar, segundo o documento: perfil e linha do tempo; agenda e próximos passos simulados;
check-in por voz e visual; Lia para perguntas limitadas e ações administrativas simuladas; copiloto com
extração e validação humana; painel de navegação com tarefas geradas após aprovação; FAQ restrito a conteúdo
institucional aprovado.

## Estado atual (31/10/2026)

O código parte do IRIS do time (`npm run dev`; equipe em `/`, paciente em `/paciente`). Já funcionam: seed
fictício com reset, jornada/agenda/documentos/check-in do paciente, Lia por texto com os quatro status e
confirmação, painel da equipe com pendências e "Assumir conversa". **Ainda faltam os passos 1 a 4 do roteiro
(copiloto → aprovação → tarefa → etapa nova no app)**, que são o centro da demo. Usuários do seed: Dra. Camila
Ribeiro (médica), Enf. Rodrigo Mendes (enfermagem), Carla Menezes (navegação) e Maria Oliveira Costa
(paciente). A consulta da Maria é na próxima terça, 14h (mockup do conceito), calculada a partir da data do reset.

## Ordem de construção (corte de baixo para cima se faltar tempo)

| # | Entrega | Por que nesta posição |
|---|---|---|
| 1 | Seed fictício + `POST /api/demo/reset` + barra de troca de usuário | Sem isso não dá para ensaiar |
| 2 | Paciente: tela inicial + Minha jornada | Primeira tela que o júri vê e a última que vai lembrar |
| 3 | Pro: copiloto com extração em `IA_MODO=fixture` + fila de validação | Mostra a IA com humano no controle |
| 4 | Aprovar → tarefa para a navegação → etapa visível → app atualizado | Fecha o ciclo: é **a** demo |
| 5 | Lia em **texto** com `consultar_agenda` + orbe com estados + quatro status de resultado | A lógica da Lia sem o risco do microfone |
| 6 | Voz da Lia: TTS com áudio pré-gerado para as falas do roteiro; STT com fixture e, se der, real | O documento põe voz no roteiro; o pré-gerado garante que funciona |
| 7 | Check-in visual + por voz ("Hoje estou muito cansada…") + revisão no Pro | Completa o roteiro |
| 8 | Visão geral e indicadores no Pro | Mostra escala e mensurabilidade |
| 9 | Extração ao vivo com Claude e STT real ao vivo | Impressiona, mas sempre com fallback |
| 10 | Reagendamento, lembrete, contato com a enfermagem pela Lia; cuidador | Profundidade para perguntas do júri, fora do roteiro principal |

Regra: nada entra no roteiro se não tiver passado em três ensaios seguidos. Se a voz não estiver estável,
mostre os passos 5 e 7 digitando na mesma interface da Lia: a lógica é a mesma, e o júri vê o orbe e os
status.

## Dados fictícios

Seed idempotente em `backend/app/demo/seed.py`. Nomes obviamente fictícios e selo "dados fictícios" nas telas.

- **Maria (protagonista)**, linha de cuidado mama. Estado **antes** da demo: *Diagnóstico registrado*
  (concluído), *Consulta oncológica* (em andamento: é a consulta mostrada), *Exames pré-tratamento*
  (aguardando), *Início do tratamento* (futuro), *Acompanhamento* (futuro). **Não existe** etapa ligada à
  fertilidade: ela nasce na demo, após a aprovação. Isso mostra causa e efeito.
- Próximo compromisso: "Consulta com especialista · quinta-feira, 10h30", com orientação de preparo validada
  cadastrada.
- Consulta com a transcrição de `references/transcricao-demo.md` e a extração gravada em
  `fixtures/extracoes/mama-fertilidade.json`.
- Três check-ins anteriores da Maria (Bem, Bem, Mais ou menos) para a tendência não começar vazia.
- **6 a 8 outros pacientes** variados: dois com tarefa vencida (ex.: autorização de exame há 4 dias), um com
  check-in aguardando revisão no prazo, um com revisão atrasada, um em dia e um recém-chegado.
- Usuários: Dra. Ana (médica), Enf. Bruno (enfermagem), Carla (navegação), Maria (paciente) e, opcionalmente,
  Pedro (cônjuge, cuidador com `agenda:ler`). Senhas só no `.env.example` da demo.
- Regras de revisão de exemplo (`exemplo = true`): "check-in Muito mal ou Mal com relato de cansaço →
  enfermagem em 24 h" e "piora em 3 check-ins seguidos → navegação em 48 h", com "critério ilustrativo — a
  definir com o serviço".
- Prazo padrão de tarefa de encaminhamento: 72 h (configuração da instituição fictícia).

## Roteiro (alvo: 4 min 30 s; ensaie com cronômetro)

Os sete passos são os do documento (seção 10), na mesma ordem.

| Tempo | Tela | Ação | Fala-guia |
|---|---|---|---|
| 0:00–0:30 | Slide | Problema | "A jornada oncológica tem muitas portas de entrada, profissionais e etapas. Quando a informação não conversa, o paciente precisa descobrir sozinho o próximo passo, e o que ele disse na consulta se perde." |
| 0:30–1:10 | Pro · Copiloto (Dra. Ana) | **1.** Transcrição da consulta simulada e, ao lado, os itens extraídos | "Com consentimento, a consulta é transcrita. A IA não diagnostica: ela destaca o que a paciente relatou, com a fala original ao lado." |
| 1:10–1:50 | Pro · Validação | **2.** Item "Paciente relata preocupação com a fertilidade" com a citação → **Confirmar** com "Gerar tarefa para a navegação" (prazo 72 h, vindo da configuração) | "Nada vale até a profissional revisar e aprovar. Só o que é aprovado vira tarefa ou chega à paciente." |
| 1:50–2:10 | Pro · Tarefas (Carla) | **3.** A tarefa aparece para a navegação com responsável e prazo | "A navegação passa a acompanhar. Toda informação tem origem, status e responsável." |
| 2:10–2:40 | Paciente (Maria) | **4.** Jornada com a nova etapa "Avaliação de fertilidade · Próxima etapa" e o próximo compromisso | "A Maria vê o que foi aprovado, em linguagem dela, e sabe qual é o próximo passo." |
| 2:40–3:20 | Paciente · Lia | **5.** Toca em "Falar com a Lia": "Quando é minha próxima consulta?" O orbe passa por ouvindo, processando e falando; resposta por voz e texto com o selo *Informação consultada* | "Ela escolhe: tocar ou falar. A Lia responde só com o que está no sistema e diz exatamente o que fez." |
| 3:20–3:55 | Paciente · Como estou? | **6.** Por voz: "Hoje estou muito cansada e preocupada com o trabalho." Tela "Entendi: …" → confirmar → selo *Check-in registrado*. `AvisoUrgencia` e "quem vê" visíveis | "Entre consultas, ela conta como está. O app deixa claro quem vê e que isso não é canal de emergência." |
| 3:55–4:30 | Pro · Check-ins (Enf. Bruno) | **7.** Check-in aguardando revisão, com prazo da regra e tendência; "Assumir" | "A equipe autorizada vê, com prazo e responsável definidos pelo serviço. Cada etapa do cuidado, conectada." |

Fechamento (slide): o pitch e "próximo passo: piloto institucional em uma linha de cuidado, com indicadores
definidos com o Cancer Center".

## À prova de palco

- **Sem Wi-Fi:** tudo em `docker compose` no notebook. `IA_MODO=fixture` e voz em fixture são o padrão do
  roteiro. As falas da Lia no roteiro ficam **pré-geradas em áudio** (`fixtures/audio/`) com a voz escolhida.
  O botão "ao vivo" (Claude, STT e TTS reais) só aparece se a rede do local tiver sido testada.
- **Microfone:** use um microfone de lapela ou headset, nunca o do notebook com o salão barulhento. Se o STT
  errar, use o chip de sugestão com o mesmo texto: o fluxo segue igual.
- **Reset** antes de cada ensaio e antes de subir: `POST /api/demo/reset`, e confira a tela inicial da Maria.
- **Ensaio automatizado:** `frontend/e2e/demo.spec.ts` (Playwright) executa o roteiro inteiro em modo fixture
  e verifica que (a) a tarefa aparece para a Carla, (b) a etapa aparece no app da Maria, (c) a Lia responde
  com a data certa e o selo *Informação consultada* e (d) o check-in aparece para o Bruno. Se falhar, não
  apresente ao vivo: use o vídeo.
- **Vídeo de backup** do roteiro completo, guardado localmente.
- Zoom de 125% no Pro. Notificações do sistema desligadas. Abas pré-abertas: Pro (Dra. Ana), Pro (Carla), Pro
  (Bruno) e o app da Maria em janela de celular (ou no próprio celular, espelhado).

## Pitch e números

- **Pitch curto:** "A jornada oncológica ainda é fragmentada: pacientes navegam por consultas, exames,
  profissionais e autorizações sem enxergar o caminho todo. O OncoFlow conecta paciente, profissionais e
  navegação: organiza o que é dito na consulta, transforma o que foi aprovado em próximos passos coordenados,
  e deixa o paciente escolher como interagir, tocando ou falando com a Lia. Cada etapa do cuidado, conectada."
- Não prometa redução de tempo, de retrabalho ou melhora de desfecho: diga que os indicadores (tempo entre
  etapas, tarefas vencidas, tempo entre relato e revisão, compreensão dos próximos passos) serão **medidos no
  piloto**.
- Números do Cancer Center citados na palestra (191 leitos, 63 consultórios, 42 salas de quimioterapia, 10
  salas cirúrgicas com robô) **só depois de confirmar com o hospital**. Na dúvida, não use.
- "OncoFlow" e "Lia" são nomes de trabalho: diga isso se perguntarem; marca, domínio e nome ainda serão
  validados.
- Diferenciais: não é só chatbot nem só transcrição; proveniência visível; profissional no controle; voz +
  visual com acessibilidade para pessoas idosas sem infantilizar; Lia que nunca diz "feito" sem confirmação.

## Perguntas difíceis prováveis

| Pergunta | Resposta curta |
|---|---|
| "E se a IA errar?" | "Ela só sugere, com a fala original ao lado. Nada chega ao paciente ou vira tarefa sem aprovação, e as rejeições medem a qualidade da IA." |
| "E se a Lia disser algo errado?" | "Ela só responde com o que as ferramentas devolvem, pede confirmação antes de agir e tem uma checagem que bloqueia qualquer 'remarquei' sem confirmação do sistema." |
| "E a LGPD?" | "Consentimento por finalidade, gravação opcional e interrompível, acesso por perfil, instituição, equipe e finalidade, cuidador com permissões granulares e revogáveis, auditoria de cada acesso. Na demo, só dados fictícios." |
| "Vocês integram com o prontuário?" | "Não presumimos. Somos uma camada de coordenação; integrações dependem dos sistemas do Cancer Center e entram no piloto institucional." |
| "Quem responde o check-in de madrugada?" | "O app diz que não é emergência e mostra o canal de urgência do hospital. Quem revisa e em que prazo é o serviço que define; o sistema garante responsável e mostra o atraso." |
| "Idosos vão usar voz?" | "Eles escolhem. Tudo funciona tocando também, com fonte ajustável, botões grandes e leitura em voz alta." |

## Para os mentores

Leve as perguntas de validação (documento anterior, seção 14) e anote as respostas em
`docs/validacao-mentores.md`. Priorize: quem revisaria os check-ins e em que prazo; quais informações se perdem
hoje entre a consulta e a próxima etapa; qual linha de cuidado seria o piloto; e se a voz da Lia faz sentido
para os pacientes deles. As respostas mudam as regras de revisão, o seed e o roteiro.
