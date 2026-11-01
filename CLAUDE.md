# OncoFlow

Plataforma de coordenação da jornada oncológica, com MVP para o MIT Hacking Medicine (trilha de Oncologia).
Assinatura sugerida: "Cada etapa do cuidado, conectada." Uma única plataforma, com serviços e dados
compartilhados, e duas experiências distintas:

- **OncoFlow Pro:** portal web para médicos, enfermagem, navegação e gestão hospitalar.
- **OncoFlow Paciente:** app mobile para pacientes e cuidadores autorizados, **híbrido**: navegação visual + a
  assistente de voz **Lia** (nome de trabalho).
- **Camada de inteligência:** copiloto de consulta, busca contextual e automação controlada, com revisão
  humana.

Fontes, em ordem de precedência quando divergirem:
1. "OncoFlow — Conceito de produto, experiência do paciente e identidade da assistente virtual" (31/10/2026),
   que consolida as decisões.
2. "OncoFlow AI — Proposta de produto" (10 páginas), que traz a base de problema, stack e roadmap.

As duas são propostas para validação, não requisitos confirmados pelo hospital.

**Decisão do time (31/10/2026):** a experiência da equipe parte do protótipo **IRIS** (do próprio time, feito no
Google AI Studio) e a do paciente segue o conceito OncoFlow. O código do MVP usa a base do IRIS.

**Código atual (MVP):** React 19 + TypeScript + Vite + Tailwind 4 · servidor Node/Express (`server.ts`,
`server/`) com estado em memória compartilhado pelas duas experiências · OncoFlow Pro em `/` (`src/App.tsx`,
`src/components/`) · OncoFlow Paciente em `/paciente` (`src/paciente/`) · Lia por regras locais
(`server/lia.ts`) · Gemini só para transcrever a fala · configuração do serviço como dados em
`server/configServico.ts`. Rodar: `npm install` e `npm run dev`. Antes de entregar: `npm run lint` e `npm run build`.

**Arquitetura-alvo (depois da demo):** Python + FastAPI · PostgreSQL · Claude para extração e para a Lia ·
STT/TTS atrás de interfaces. Detalhes em `.claude/skills/oncoflow-arquitetura`.

## Regras que nunca se quebram

1. **A IA sugere, o profissional aprova.** Nenhuma saída de IA chega ao paciente, vira tarefa ou entra em
   registro sem status `confirmado` dado por um profissional.
2. **Origem, status e responsável claros.** Todo conteúdo distingue fala literal, extração da IA, hipótese do
   sistema e informação confirmada. Hipótese nunca é exibida como fato.
3. **A IA não diagnostica, não prescreve, não altera tratamento e não decide prioridade clínica.** Nem o
   copiloto nem a Lia.
4. **A Lia só executa ações permitidas, confirma quando necessário e nunca diz que algo foi concluído sem
   confirmação do sistema.** Ela distingue informação consultada, solicitação registrada, tarefa encaminhada e
   ação confirmada.
5. **O paciente escolhe como interagir.** O que dá para fazer visualmente também deve dar para pedir por voz,
   quando for seguro. A voz nunca é obrigatória. Simples sem infantilizar.
6. **Check-in não é monitoramento em tempo real nem emergência.** Toda tela de check-in e da Lia diz isso,
   mostra as instruções de urgência do hospital e informa quem vê os dados. As regras de revisão são do
   serviço, nunca limiares clínicos no código.
7. **Acesso por perfil, instituição, equipe e finalidade.** Cuidador só com delegação explícita, granular e
   revogável. Tudo auditado.
8. **Só dados fictícios** em repositório, seeds, prompts, logs e capturas de tela. Gravação só com
   consentimento, sempre interrompível.
9. **Não presumir integrações nem prometer desfecho.** Prontuário, agenda e laboratório são simulados.
   Indicadores são medidos no piloto.

## Qual skill usar

| Tarefa | Skill |
|---|---|
| Backend, banco, API, modelo de domínio, máquinas de estado, indicadores, testes | `oncoflow-arquitetura` |
| Copiloto de consulta: transcrição, extração por LLM, resumo, fila de validação, avaliação | `oncoflow-copiloto-ia` |
| Lia: voz, persona, orbe, ferramentas, confirmação de ações, memória contextual | `oncoflow-assistente-lia` |
| Acesso, cuidador, consentimento, auditoria, LGPD, fornecedores, revisão antes de merge | `oncoflow-seguranca-lgpd` |
| Telas do Paciente e do Pro, marca, paleta, textos, acessibilidade | `oncoflow-experiencia` |
| Seed, roteiro de 3–5 min, pitch, ensaio, perguntas do júri | `oncoflow-demo-hackathon` |
