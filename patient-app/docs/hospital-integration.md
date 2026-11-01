# Integração hospitalar implementada — demonstração 0.11

O app Android e o OncoFlow Pro compartilham o servidor Express do repositório MIT-Einstein-. A versão autocontida inclui `patient-app/`, servidor e painel. `docs/connected-demo.md` na raiz da plataforma descreve build, execução na rede e hospedagem futura. O conjunto usa exclusivamente dados fictícios; não é uma conexão com serviço clínico de produção nem uma implementação FHIR.

## Sessão e execução

A equipe gera um código temporário por paciente em `POST /api/pro/pacientes/:id/mobile-pairing`. O app troca esse código em `POST /api/mobile/pair` por token, prazo e escopo de tenant/hospital/paciente. O código só funciona uma vez. Token fica em memória, fora de armazenamento, logs e contexto da Lia. Servidor verifica o escopo em toda operação. Reiniciar processo ou resetar revoga as sessões; os dados confirmados persistem separadamente.

O fluxo real está em `src/integrations/hospital/connection.ts`, `useConnectedPatient.ts` e App.tsx. O adaptador assíncrono é usado pelas telas e pela ponte da Lia sobre o mesmo snapshot. O antigo `createPatientIntegration` permanece como fronteira programática; não é o seletor de runtime do app. Nenhuma variável de ambiente ativa uma conexão sem pareamento.

URL pública exige HTTPS. HTTP só é permitido com opção explícita para endereço privado/loopback de demonstração; no Android, apenas o build debug permite tráfego local claro. O modo independente anterior permanece disponível. Chaves OpenAI/ElevenLabs não são transmitidas ao painel.

## API v1

Prefixo: `/api/v1/tenants/{tenantId}/hospitals/{hospitalId}/patients/{patientId}`. Envelope `{apiVersion:"1",resourceType,scope,asOf,data}` validado estritamente no cliente. O token deve autorizar exatamente o escopo indicado.

| Operação | Recurso | Efeito |
| --- | --- | --- |
| GET | summary | Nome, equipe, último bem-estar e careContext autorizado do cadastro oncológico |
| POST | symptom-reports | Analisa a fala antes do GPT; sinal afirmativo cria relato literal e pendência para revisão com recibo idempotente |
| GET | appointments / journey / documents | Agenda, jornada e documentos publicados pelo Pro |
| GET | requests / preferences / messages | Status atuais, preferências e mensagens autorizadas |
| POST | requests | Pedido confirmado de contato/reagendamento; não altera o compromisso |
| POST | wellbeing | Registro confirmado do paciente |
| POST | messages | Mensagem confirmada para a equipe |
| PUT | preferences | Idioma, explicação, velocidade e texto |

Tipos completos em `shared/hospitalContracts.ts`. `summary.lastWellbeing` restaura o registro após novo pareamento. Mensagens contêm `role`, `authorLabel`, `text`, `createdAt`, `status`; notas internas/hipóteses ficam fora da visão do paciente. Texto da equipe é preservado no idioma original, sem tradução clínica automática.

As rotas Pro editam agenda/jornada e publicam documentos com confirmação explícita de revisão. O plano interno é separado. Pedidos aparecem nas pendências existentes do Pro, e o estado retornado ao app deriva dessas pendências. `accepted`/recebido não significa lido, entregue ou atendimento concluído.

## Confirmação, idempotência e cancelamento

Bem-estar, pedidos e mensagens diretas exigem confirmação; preferências são alterações explícitas. O encaminhamento de sinal relatado na Lia é automático, conforme pedido do usuário para este MVP e informado na interface. Cada operação usa uma chave estável; repetição após falha mantém o corpo original e uma sessão nova gera uma chave nova. Não há retry HTTP automático. Servidor persiste idempotência e rejeita mesma chave com outro conteúdo. Perda da resposta pode ter resultado desconhecido: o app não afirma que nada foi enviado e permite repetir a mesma operação.

Alterar perfil, desconectar, cancelar conversa ou mudar idioma impede resultados antigos de atualizar a interface. Abortar uma requisição já despachada não desfaz gravação do servidor; o estado confirmado é consultado novamente. Respostas são limitadas a256KiB, com tipo, IDs, datas, escopo e status validados.

## Limites da demonstração e evolução

A autenticação Pro ainda é a identificação fictícia do MVP por `x-demo-usuario`; não equivale a login hospitalar de produção. Pareamento limita o app ao paciente escolhido, mas publicar este MVP não transforma seus usuários de demonstração em contas seguras. Produção exige autenticação institucional, autorização real, revisão operacional e política de dados.

Relatos afirmativos em texto ou voz na Lia passam por `symptom-reports` antes do GPT. O serviço decide se registra o sinal e retorna orientação/recibo. Perguntas, hipóteses e negações não criam alerta. Isso não atribui prioridade clínica. Os botões de cenários locais continuam separados e identificados como simulação. O contexto oncológico publicado não inclui plano interno ou hipóteses, e não autoriza o modelo a completar dados ausentes.

Dados persistem em arquivo ignorado pelo Git. Para apresentação local, mantenha o servidor ativo; para uso fora da rede, hospede o pacote com HTTPS e volume persistente. Docker/Compose foram preparados; testes HTTP e os ensaios Android são descritos em [verification-v010.md](verification-v010.md).
