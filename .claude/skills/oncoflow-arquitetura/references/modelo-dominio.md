# Modelo de domínio do OncoFlow

Campos essenciais. Todas as tabelas têm `id uuid PK`, `criado_em` e `atualizado_em` (`timestamptz`). Toda
tabela com dado de paciente tem `instituicao_id ref instituicao`, e o `service` sempre filtra por ela.

## Instituição, pessoas e acesso

**instituicao** — `nome`, `fuso`, `config jsonb` (prazos padrão por tipo de tarefa, texto de urgência aprovado,
nome da assistente, frequência padrão de check-in).

**usuario** — `instituicao_id`, `nome`, `email` (único), `senha_hash` (bcrypt), `papel` enum(`paciente`,
`cuidador`, `medico`, `enfermagem`, `navegacao`, `gestao`, `admin_demo`), `ativo`, `paciente_id ref` (só
quando papel = paciente).

**paciente** — `instituicao_id`, `nome_exibicao` (fictício no MVP), `linha_cuidado` (ex.: `mama`),
`navegador_responsavel_id`, `medico_responsavel_id`. Minimização: sem CPF, endereço ou data de nascimento no
MVP.

**preferencias_comunicacao** — `paciente_id`, `modo_preferido` enum(`visual`, `voz`, `ambos`),
`velocidade_audio` (0,75 a 1,25), `tamanho_fonte` (`padrao`, `grande`, `muito_grande`), `forma_tratamento`
(opcional; o padrão é linguagem neutra), `frequencia_checkin` (combinada com o paciente, dentro do permitido
pela instituição).

**vinculo_equipe** — `paciente_id`, `usuario_id`, `funcao`. Sem vínculo, o profissional não lê relato,
transcrição nem documento do paciente.

**delegacao_acesso** — `paciente_id`, `cuidador_usuario_id`, `relacao` (ex.: filha, cônjuge), `escopos
text[]` (ver a lista em `oncoflow-seguranca-lgpd`), `estado` enum(`convidada`, `ativa`, `revogada`,
`expirada`), `concedida_em`, `revogada_em`, `expira_em` (opcional). O acesso clínico irrestrito nunca é
automático.

## Jornada, agenda e documentos

**etapa_jornada** — `paciente_id`, `titulo` (linguagem do paciente), `descricao_paciente`,
`servico_responsavel`, `ordem`, `estado` enum(`futura`, `aguardando`, `proxima`, `em_andamento`, `concluida`,
`cancelada`), `data_prevista`, `concluida_em`, `origem` enum(`manual`, `item_extraido`), `item_extraido_id`,
`visivel_paciente`.

**compromisso** (agenda simulada) — `paciente_id`, `etapa_id`, `tipo` enum(`consulta`, `exame`,
`procedimento`, `outro`), `titulo`, `inicio`, `local`, `orientacao_id ref orientacao_institucional`,
`origem` enum(`simulado`, `integracao`). No MVP é sempre `simulado`.

**lembrete** — `paciente_id`, `criado_por` (paciente, cuidador ou Lia em nome de alguém), `compromisso_id`
(opcional), `texto`, `disparar_em`, `canal` enum(`app`), `estado` enum(`agendado`, `disparado`, `cancelado`).

**documento** — `paciente_id`, `tipo` enum(`resultado`, `orientacao`, `relatorio`, `outro`), `titulo`,
`arquivo_url` (link assinado), `liberado_paciente bool`, `liberado_por`, `liberado_em`. O paciente e a Lia só
veem documentos liberados.

**orientacao_institucional** — `titulo`, `tipo` enum(`preparo_exame`, `faq`, `apoio`), `texto`,
`aprovada_por`, `versao`, `ativa`. É a única fonte para "como será meu exame?" e para o FAQ.

## Tarefas e solicitações

**tarefa** — `paciente_id`, `etapa_id` (opcional), `tipo` enum(`exame`, `consulta`, `autorizacao`,
`encaminhamento`, `contato`, `outro`), `descricao`, `responsavel_usuario_id` ou `responsavel_papel`, `prazo`
(obrigatório), `estado` enum(`aberta`, `em_andamento`, `concluida`, `cancelada`), `motivo_cancelamento`,
`concluida_em`, `origem` enum(`manual`, `item_extraido`, `solicitacao`), `item_extraido_id`,
`solicitacao_id`. Vencida = `estado in (aberta, em_andamento) and prazo < now()`.

**solicitacao** — `paciente_id`, `aberta_por_usuario_id`, `canal` enum(`app`, `voz`), `tipo`
enum(`reagendamento`, `contato_equipe`, `duvida`, `relato`), `descricao` (o que foi entendido, já confirmado
pelo paciente), `compromisso_id` (reagendamento), `estado` enum(`registrada`, `em_analise`, `atendida`,
`recusada`, `cancelada_pelo_paciente`), `responsavel_papel`, `prazo_resposta`, `resposta_ao_paciente`.

## Consulta e IA (copiloto)

**consulta** — `paciente_id`, `medico_id`, `inicio`, `fim`, `consentimento_audio_id` (nulo = sem gravação).

**segmento_transcricao** — `consulta_id`, `ordem`, `interlocutor` enum(`medico`, `paciente`, `acompanhante`,
`nao_identificado`), `texto`, `inicio_ms`, `fim_ms`. Nível da **fala literal**.

**item_extraido** — `consulta_id`, `categoria` enum(`sintoma_relatado`, `preferencia`, `preocupacao`,
`necessidade_possivel` (necessidades e possíveis acompanhamentos), `pendencia_operacional`, `duvida_paciente`), `tipo` enum(`dado_extraido`,
`hipotese_ia`), `texto_ia` (imutável), `texto_validado`, `status` enum(`pendente_validacao`, `confirmado`,
`rejeitado`), `motivo_rejeicao`, `validado_por`, `validado_em`, `modelo_ia`, `versao_prompt`.

**evidencia_item** — `item_id`, `segmento_id`, `citacao` (substring exata, verificada no backend).

**resumo_consulta** — `consulta_id`, `secoes jsonb` (cada frase com `segmento_ids`), `estado`
enum(`rascunho_ia`, `em_revisao`, `aprovado`), `aprovado_por`, `aprovado_em`, `modelo_ia`, `versao_prompt`.

## Check-in e revisão

**convite_checkin** — `paciente_id`, `frequencia` (da preferência, dentro do limite da instituição),
`proximo_em`, `ativo`.

**checkin** — `paciente_id`, `registrado_por_usuario_id` (paciente ou cuidador com escopo), `canal`
enum(`visual`, `voz`), `escala` enum(`muito_bem`, `bem`, `mais_ou_menos`, `mal`, `muito_mal`),
`relatos jsonb` (opcionais e habilitados pelo serviço: dor, cansaço, náusea, preocupações, dificuldades
práticas), `texto_livre` (digitado ou transcrito da fala), `substitui_id`, `enviado_em`. Imutável.

**regra_revisao** — `instituicao_id`, `nome`, `condicao jsonb` (DSL simples: `{"escala_em": ["muito_mal"]}`,
`{"piora_consecutiva": 3}`, `{"relato_marcado": "dor"}`), `papel_responsavel`, `prazo_resposta_horas`,
`ativa`, `exemplo bool`.

**revisao_checkin** — `checkin_id`, `regra_id`, `estado` enum(`aguardando_revisao`, `em_revisao`, `revisado`),
`responsavel_papel`, `prazo_resposta`, `desfecho`, `nota`, `revisado_por`, `revisado_em`.

## Lia

**interacao_lia** — `paciente_id`, `usuario_id` (paciente ou cuidador), `canal` enum(`voz`, `texto`),
`texto_entendido` (transcrição do comando), `intencao`, `ferramentas jsonb` (nome, status, ids afetados),
`resposta`, `urgencia_detectada bool`. Sem áudio guardado por padrão.

**confirmacao_pendente** — `token` (único), `usuario_id`, `ferramenta`, `parametros jsonb`, `resumo`,
`expira_em` (2 min), `usado_em`.

## Governança

**consentimento** — `paciente_id`, `finalidade` enum(`gravacao_audio_consulta`, `transcricao_e_ia_consulta`,
`checkin`, `assistente_voz`, `compartilhamento_cuidador`), `versao_termo`, `estado` enum(`ativo`,
`revogado`), `concedido_em`, `revogado_em`.

**evento_auditoria** (somente inserção; garantido por permissão no banco) — `instituicao_id`, `ator_id`,
`ator_papel`, `via_delegacao_id`, `acao` (`ler`, `criar`, `transicionar`, `validar`, `rejeitar`, `exportar`,
`revogar`, `confirmar_acao_lia`), `recurso`, `recurso_id`, `paciente_id`, `finalidade`, `antes jsonb`,
`depois jsonb`, `motivo`, `ocorrido_em`. Registre só ids e estados, nunca texto de fala ou relato.

**notificacao** (outbox) — `destinatario_id`, `canal` enum(`app`, `email_simulado`), `modelo`, `dados jsonb`,
`estado` enum(`pendente`, `enviada`, `falhou`), `tentativas`. Notificação ao paciente nunca leva conteúdo
clínico, só "há uma atualização na sua jornada".
