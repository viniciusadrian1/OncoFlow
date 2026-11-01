---
name: oncoflow-experiencia
description: Experiência, marca e frontend do OncoFlow — app OncoFlow Paciente híbrido (visual + voz com a Lia; tela inicial com próxima consulta, Minha jornada, Como estou?, Minha agenda, Meus documentos, Falar com a assistente), portal OncoFlow Pro (visão geral, perfil do paciente, gestão de tarefas, check-ins, copiloto, indicadores), sistema visual de proveniência (fala literal, extração, hipótese, confirmado), identidade de marca (paleta azul profundo #123B56, verde-água #167C70, turquesa #55B9B0, gelo #EAF3F4; Inter/Manrope/Sora; assinatura "Cada etapa do cuidado, conectada."), textos em PT-BR acolhedores sem infantilizar, acessibilidade WCAG AA para pessoas idosas e estados de tela. Use sempre que for criar ou alterar tela, componente React, layout, texto de interface, cores, logo, tipografia, PWA ou acessibilidade do OncoFlow, ou quando pedirem "fazer a tela X", "deixar mais bonito", "aplicar a marca".
---

# OncoFlow — experiência do paciente, da equipe e marca

Duas experiências com necessidades opostas, sobre a mesma plataforma (documento "Conceito de produto",
seção 2). O **paciente** quer simplicidade, orientação, acolhimento e autonomia: pouca informação por tela,
linguagem simples e a escolha entre tocar e falar. A **equipe** quer produtividade, rastreabilidade e visão
operacional: densidade, achar o que está atrasado e validar sugestões da IA sem confundir sugestão com fato.
**Não adapte a mesma tela para os dois públicos.**

## Marca (documento, seção 11)

- **Nome:** OncoFlow (nome de trabalho; marca e domínio ainda precisam ser verificados). **Assinatura
  sugerida:** "Cada etapa do cuidado, conectada."
- **Personalidade:** humana, confiável, inovadora, fluida, premium (contemporânea, limpa, profissional).
- **Símbolo:** caminho contínuo ou linhas conectadas, com referência abstrata à letra O e à ideia de fluxo.
  Evite cruz médica genérica, laço de conscientização como símbolo principal, coração literal, excesso de
  detalhe e aparência infantil.
- **Tipografia:** sans-serif moderna e legível. Use **Inter** na interface (melhor legibilidade em tamanhos
  pequenos e números tabulares no Pro). Manrope ou Sora só em títulos de marketing, se quiser.

### Paleta e contraste (medido, WCAG 2.2)

| Token | Hex | Uso permitido |
|---|---|---|
| `azul-profundo` | #123B56 | Texto principal, cabeçalhos, fundo de destaque com texto branco (11,8:1) |
| `verde-agua` | #167C70 | Botão primário com texto branco (5,1:1), links e ícones sobre branco. **Sobre gelo dá 4,49:1, abaixo do mínimo: use texto ≥ 24 px (ou 19 px em negrito) ou troque para azul.** |
| `turquesa` | #55B9B0 | **Só decorativo** (orbe da Lia, ilustrações, fundo com texto azul por cima: 5,0:1). Sobre branco dá 2,35:1: reprovado para texto e para borda de componente (mínimo 3:1). |
| `gelo` | #EAF3F4 | Fundo de seções e cards. Texto sobre ele sempre em azul-profundo (10,4:1) |

Estados funcionais (erro, atenção, sucesso) têm tokens próprios com contraste aprovado e **sempre ícone +
texto**. A marca não comunica estado sozinha. Defina tudo em `packages/shared/tokens` e no `tailwind.config`;
nada de hex espalhado nos componentes.

## OncoFlow Paciente: experiência híbrida

Decisão do documento: navegação visual tradicional + agente de IA por voz (Lia; ver
`oncoflow-assistente-lia`). **Tudo o que puder ser feito visualmente deve, quando fizer sentido e for seguro,
também poder ser pedido por voz.** Ao criar uma tela, crie a ação de voz correspondente ou registre por que
não.

| Necessidade | Pelo visual | Por voz |
|---|---|---|
| Consultar agenda | Abrir "Minha agenda" | "Quando é minha próxima consulta?" |
| Registrar bem-estar | Preencher check-in | "Hoje estou muito cansado." |
| Ver documento | Abrir lista de documentos | "Quero ver meu último resultado." |
| Pedir apoio | Área de suporte | "Preciso falar com minha enfermeira." |
| Lembrete | Configurar na agenda | "Me lembre um dia antes." |

### Tela inicial (nesta ordem)

1. **Próxima consulta:** data, horário, local e "como me preparar" (só orientação institucional validada).
2. **Minha jornada:** etapas concluídas, em andamento e próximas, com `X%` e o rótulo literal "Etapas
   cadastradas concluídas".
3. **Como estou?** Atalho para o check-in.
4. **Minha agenda:** consultas, exames e lembretes.
5. **Meus documentos:** resultados e orientações liberados.
6. **Falar com a assistente:** botão de destaque, com o orbe da Lia e o rótulo "Falar com a Lia" (o nome vem
   de configuração).

### Outras telas

- **Minha jornada:** linha do tempo vertical com os estados *Concluído*, *Em andamento*, *Próxima etapa*,
  *Aguardando* e *Futuro*, cada um com ícone + texto. Ao tocar numa etapa: explicação simples, quem é o
  responsável ou serviço, e o que a pessoa precisa fazer.
- **Como estou?** Escala de 5 (Muito bem, Bem, Mais ou menos, Mal, Muito mal) como `radiogroup` com texto;
  ícones são decorativos. Relatos opcionais (dor, cansaço, náusea, preocupações, dificuldades práticas, só os
  habilitados pelo serviço). Texto livre **ou** botão "Falar em vez de escrever". Mostre "Quem vê e para quê"
  e o `AvisoUrgencia` sempre visíveis. Ao enviar: "Recebemos sua atualização. Sua equipe vai ver conforme o
  combinado com o serviço." **Histórico e tendência também para o paciente** ("Meus registros"), não só para
  a equipe.
- **Meus documentos:** lista com tipo e data; botão "Ouvir" lê em voz alta orientações e textos autorizados.
- **Pedir apoio:** contato da navegação, "Quero falar com a equipe" (abre solicitação), conteúdo educativo
  aprovado e apoio psicossocial quando disponível.
- **Pessoas que me ajudam:** convidar um familiar ou cuidador, escolher o que ele pode ver ou fazer (escopo a
  escopo, em linguagem simples), ver os acessos dele e revogar.
- **Preferências:** tamanho da fonte, modo preferido (visual, voz ou os dois), velocidade do áudio e forma de
  tratamento.

### Confirmação de ações (visual e voz)

Antes de uma ação importante, mostre **o que foi entendido**. Depois, mostre **o que foi registrado** e o
**status real**:

```
Entendi: você não pode ir à consulta de quinta, 10h30 (Oncologia).
[ Abrir pedido de reagendamento ]   [ Não, voltar ]
──────────
✓ Pedido registrado · Aguardando a equipe analisar        ← nunca "Consulta remarcada"
```

Use os quatro status da plataforma com selos de texto: *Informação consultada*, *Solicitação registrada*,
*Encaminhado para a equipe* e *Confirmado*.

## OncoFlow Pro (portal web, desktop ≥ 1280 px)

No MVP (`src/App.tsx`, `src/components/`), o Pro segue o mockup de desktop do time: barra lateral (Início,
Pacientes, Pendências, Comunicação), cabeçalho com saudação, busca, sino de pendências e menu do usuário, quatro
indicadores calculados dos dados (nunca números fixos), lista "Pacientes em acompanhamento" e detalhe com abas
Jornada (etapas em linha horizontal + próximo compromisso), Agenda, Exames, Comunicação (chat do IRIS, "Assumir
conversa") e Resumo (diagnóstico, pendências, check-ins, plano terapêutico). A cor do paciente é a situação operacional derivada das pendências (`infoSituacao`), nunca prioridade
clínica. Os itens abaixo são o alvo completo.

1. **Visão geral:** pacientes acompanhados, etapa atual, tarefas abertas (vencidas em destaque: "vencida há
   3 dias"), check-ins aguardando revisão com o prazo e alertas operacionais. Filtros: meus pacientes, com
   tarefa vencida, com check-in aguardando revisão.
2. **Perfil do paciente:** linha do tempo, equipe responsável, informações relevantes confirmadas e
   histórico autorizado; abas *Consultas*, *Check-ins* (tendência + relatos + status de revisão),
   *Solicitações* e *Histórico*.
3. **Gestão de tarefas:** encaminhamentos, exames, consultas, solicitações e prazos, em lista e quadro por
   responsável.
4. **Check-ins:** fila de revisão por prazo; ações "Assumir" e "Concluir revisão" (desfecho obrigatório).
5. **Copiloto de consulta:** transcrição, itens extraídos e a fila de validação (padrão abaixo).
6. **Indicadores:** tempo entre etapas, tarefas vencidas, tempo entre relato e revisão, check-ins revisados no
   prazo, com período, n e o selo "dados fictícios". O perfil gestão vê só este módulo.

## Sistema de proveniência (todo conteúdo vindo da consulta)

Princípio 3: **toda informação importante tem origem, status e responsável claros.** Use um componente único,
`SeloProveniencia` (`packages/shared`). Não recrie variações por tela.

| Tipo | Visual | Texto do selo |
|---|---|---|
| Fala literal | Citação com barra lateral, interlocutor e tempo ("Paciente · 04:12") | "Fala literal" |
| Extração da IA (pendente) | Card com **borda tracejada**, fundo neutro, ícone de lápis | "Extraído pela IA · aguardando revisão" |
| Hipótese do sistema (pendente) | Borda tracejada + ícone de interrogação, texto em forma de pergunta | "Hipótese do sistema · aguardando revisão" |
| Confirmado | Borda sólida, ícone de check | "Confirmado por <nome> em <dd/mm>" |

Regras: o selo sempre tem texto; item pendente não tem ação que o leve ao paciente; a citação literal fica
visível sem clique extra.

### Fila de validação

Para cada item: categoria, selo, texto da IA, citação literal clicável e as ações **Confirmar**, **Editar e
confirmar** e **Rejeitar** (motivo: "não foi dito", "interpretação errada", "não relevante", "outro"). Para
necessidades e pendências, o diálogo de aprovação traz "Gerar tarefa para a navegação" com responsável e prazo
**preenchidos pela configuração do serviço e editáveis**, e opcionalmente "Mostrar ao paciente como etapa",
com título em linguagem simples escrito pelo profissional. Atalhos de teclado: C, E, R.

## Textos (PT-BR)

- "Você", frases curtas e o próximo passo concreto ("Leve seus exames anteriores").
- **Simples sem infantilizar** e sem presumir incapacidade digital de pessoas idosas. Nada de diminutivos
  ("consultinha"), exclamações em excesso ou tom de URA.
- Linguagem neutra em gênero por padrão. Concordância só se `forma_tratamento` estiver preenchida.
- Nada de promessa ("monitoramos você 24 h", "resposta imediata", "seu tratamento vai ser mais rápido").
- Nada de alarme para o paciente. Na equipe: "Check-in aguardando revisão · até 14h".

| Evite | Prefira |
|---|---|
| "Erro 500" | "Não conseguimos carregar agora. Tente de novo em instantes." |
| "Seu médico foi notificado." | "Sua equipe vai ver sua atualização conforme o combinado com o serviço." |
| "Sua consulta foi remarcada." (sem confirmação) | "Pedido de reagendamento registrado. Aguardando a equipe." |
| "Progresso do tratamento: 65%" | "65% · Etapas cadastradas concluídas" |

## Acessibilidade (WCAG 2.2 AA + documento, seção 3)

- Tipografia grande e **ajustável no app** (padrão 18 px, opções grande e muito grande), além de respeitar o
  zoom do sistema. Nenhuma altura fixa que corte texto.
- Contraste elevado (veja a paleta). Hierarquia visual clara.
- Botões grandes (≥ 48×48 px no app), bem separados e com rótulo explícito. Evite menus profundos: no máximo
  dois níveis.
- Estado nunca só por cor.
- Áudio com velocidade ajustável, opção de repetir e leitura em voz alta.
- Compatível com TalkBack, VoiceOver e leitores de tela no Pro: rótulos, `aria-live` para status, foco
  visível, navegação por teclado no Pro.
- `prefers-reduced-motion` respeitado (inclusive no orbe).

## Estados de toda tela

Carregando (skeleton), vazio (texto que orienta: "Nenhuma tarefa aberta"), erro ("tentar de novo") e offline
no app (último dado em cache com "atualizado em…" e check-in na fila de envio).

## Modo demo

Em `DEMO_MODE`, uma barra discreta permite trocar de usuário (Médica · Navegação · Enfermagem · Paciente) e
resetar os dados (ver `oncoflow-demo-hackathon`). Ela não existe fora do modo demo.
