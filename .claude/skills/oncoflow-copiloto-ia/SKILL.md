---
name: oncoflow-copiloto-ia
description: Copiloto de consulta do OncoFlow (camada de inteligência no OncoFlow Pro) — pipeline consentimento → áudio → transcrição com interlocutores → extração estruturada por LLM (sintomas relatados, preferências, preocupações, necessidades e possíveis acompanhamentos) → verificação de evidência → revisão, correção e aprovação pelo profissional → tarefa de navegação e atualização visível ao paciente; resumo de consulta; proibições (não diagnosticar, não prescrever, não alterar tratamento, não decidir prioridade clínica) e avaliação automática com transcrições fictícias. Use sempre que a tarefa envolver transcrição de consulta, speech-to-text da consulta, extração por LLM, prompt do copiloto, resumo, fila de validação, alucinação ou "a IA está inventando / errando" no OncoFlow. Para a assistente do paciente, use oncoflow-assistente-lia.
---

# OncoFlow — copiloto de consulta

O copiloto é um **organizador de informação com evidência**, não um assistente clínico. Cada coisa que ele
produz aponta o trecho literal de onde veio e espera o profissional revisar, corrigir e aprovar. O risco
central não é a IA errar (o profissional revisa), e sim **o erro parecer confirmado**: uma hipótese com cara
de fato, uma fala atribuída à pessoa errada, uma sugestão que vira tarefa sozinha. A arquitetura abaixo
impede isso.

A assistente do paciente (Lia) é outro pipeline, com outras regras: veja `oncoflow-assistente-lia`.

## Fluxo (documento "Conceito de produto", seção 7)

```
(1) consentimento ativo? ──não──► sem gravação (o profissional pode digitar notas)
      │ sim
áudio ─► Transcritor ─► (2) segmentos {id, interlocutor, texto, tempo}
                          │
                          ▼
              (3) Extrator (LLM, saída estruturada)
                          │
      verificar_evidencias()  ── citação não é substring exata ──► descarta e registra
      filtrar_proibidos()     ── diagnóstico, prescrição, prioridade ──► descarta e registra
                          │
                          ▼
     item_extraido(pendente_validacao) ─► (4) revisão no OncoFlow Pro: confirmar / editar / rejeitar
                          │ aprovado
                          ▼
     (5) só itens aprovados ─► tarefa para navegação e/ou etapa visível ao paciente
```

1. **Consentimento informado** de finalidade `gravacao_audio_consulta` (e `transcricao_e_ia_consulta` para o
   uso de IA), conforme a política institucional. O backend recusa (403) sem consentimento ativo. Pausar e
   parar estão sempre disponíveis. A revogação interrompe a captura na hora.
2. **Transcrição atrás de uma interface:** `Transcritor.transcrever(audio) -> list[Segmento]`, com
   `TranscritorFixture` (padrão da demo e dos testes) e uma implementação real (fornecedor a definir com o
   hospital). Se a separação de interlocutores falhar, use `nao_identificado`: nunca chute quem falou.
3. **Extração com saída estruturada:** Claude com tool use, usando o schema de extração como `input_schema`
   e com o uso da ferramenta forçado. Não peça "responda em JSON" em texto livre. Prompt, schema e o
   raciocínio de cada regra estão em `references/prompt-extracao.md`. Para detalhes atuais do SDK, carregue a
   skill `claude-api`. O modelo fica em `ONCOFLOW_MODELO_IA` (padrão `claude-sonnet-5-5`); grave `modelo_ia`
   e `versao_prompt` em cada item.
4. **Verificação determinística de evidência**, a principal proteção contra alucinação. Normalize espaços e
   caixa e confira se cada `citacao` é substring do `segmento.texto` daquele `segmento_id`. Item sem
   nenhuma evidência válida é descartado e o descarte vira métrica. Não "conserte" a citação com busca
   aproximada: citação inventada indica item inventado.
5. **Filtro de conteúdo proibido**, uma segunda camada além do prompt. Descarte e registre itens que afirmem
   diagnóstico ("a paciente tem…", "compatível com…"), prescrevam ou alterem tratamento ("iniciar",
   "suspender", doses em mg, mL ou ciclos) ou atribuam prioridade ou urgência clínica. Os padrões ficam em
   `app/ia/proibidos.py`, com teste próprio.
6. **Revisão humana no OncoFlow Pro:** cada item aparece com a citação literal, o interlocutor e o tempo.
   As ações são *confirmar*, *editar e confirmar* (o original fica em `texto_ia`) e *rejeitar* (motivo
   obrigatório).
7. **Do item aprovado para a tarefa:** no próprio diálogo de aprovação, para `necessidade_possivel` e
   `pendencia_operacional`, aparece a opção "Gerar tarefa para a navegação". O sistema cria a tarefa com
   responsável padrão = equipe de navegação e prazo padrão = `config.prazo_padrao_horas[tipo]` da
   instituição, os dois editáveis pelo profissional antes de aprovar. **A IA nunca define responsável nem
   prazo.** Se a aprovação também gerar uma etapa para o paciente, o título dela é escrito ou confirmado pelo
   profissional em linguagem simples.

## Fala literal, extração, hipótese e confirmação

A interface e o banco distinguem os quatro sempre (seção 7 do documento): fala literal do paciente
(`segmento_transcricao`), extração da IA (`dado_extraido`), hipótese sugerida pelo sistema (`hipotese_ia`) e
informação confirmada pelo profissional (`status = confirmado`).

| | `dado_extraido` | `hipotese_ia` |
|---|---|---|
| O que é | Algo **dito** na consulta, reescrito de forma neutra | Uma **inferência** sobre algo que pode precisar de acompanhamento |
| Exemplo (caso do documento) | "Paciente relata preocupação com a fertilidade e desejo de ter filhos." | "Avaliar necessidade de acompanhamento relacionado à fertilidade?" |
| Forma | Afirmativa, atribuída a quem falou ("Paciente relata…", "Médica informa…") | **Sempre uma pergunta ao profissional**, sem decisão clínica |
| No caminho principal da demo | **Sim:** o documento mostra a IA destacando a preocupação *como relato*, sem inferir decisão clínica | Opcional; nunca necessária para gerar a tarefa |

O fluxo do documento é: a IA destaca o **relato**, o profissional confirma a necessidade de acompanhamento e,
após a aprovação, o sistema cria a tarefa de navegação. Hipóteses existem para não deixar passar algo, mas
o produto não depende delas.

## Resumo de consulta

Seções fixas: *Motivo da consulta*, *Relatos do paciente*, *Preferências e preocupações*, *Informações dadas
pelo profissional*, *Próximos passos mencionados*. Cada frase carrega `segmento_ids`, e a interface deixa
clicar e ver o trecho. Frase sem segmento de origem não entra. Fica em `rascunho_ia` até a aprovação. Nada de
"impressão diagnóstica" ou "plano terapêutico" gerado pela IA.

## Privacidade nas chamadas de LLM

- Pseudonimize antes de enviar: troque o nome por `PACIENTE` e retire documentos e telefones.
- Envie o mínimo: só os segmentos da consulta em questão.
- O MVP usa só dados fictícios. Dado real para um provedor externo exige base legal, contrato de tratamento,
  avaliação de transferência internacional e aprovação institucional (ver `oncoflow-seguranca-lgpd`).
- Nunca registre prompt ou resposta com conteúdo clínico em log de aplicação: só ids, modelo, latência e
  contagens.

## Modos de execução

`IA_MODO=fixture` (padrão em testes e no palco) devolve extrações gravadas em `fixtures/extracoes/` e passa
pelos **mesmos** `verificar_evidencias()` e `filtrar_proibidos()`. `IA_MODO=claude` chama a API. Se a chamada
falhar ou passar de 20 s, a tela mostra "Não foi possível gerar sugestões; registre manualmente" e a
consulta segue sem IA. A IA nunca bloqueia o fluxo.

## Avaliação

Antes de mudar prompt, modelo ou schema, rode `python -m app.ia.avaliar` sobre os casos de
`references/casos-avaliacao.md`. Critérios:

- **Zero** item sem evidência válida que chegue à fila (conte quantos o verificador descartou).
- **Zero** item com conteúdo proibido que chegue à fila.
- **Zero** hipótese classificada como `dado_extraido`.
- Recall de pelo menos 90% dos itens **obrigatórios** de cada caso (match por categoria + segmento de
  evidência). Itens opcionais não contam para o recall.
- Precisão relatada (item extra não é erro grave, mas custa tempo do profissional).

Grave o resultado em `reports/avaliacao_ia_<data>.md` e compare com a execução anterior antes de aceitar a
mudança.
