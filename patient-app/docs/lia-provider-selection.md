# Lia — modelos e voz inicial

Seleção de provedores verificada em 31/10/2026. Registro histórico da configuração inicial. A integração Android foi implementada posteriormente na versão 0.2; veja `verification-v02.md`.

| Função | Configuração |
| --- | --- |
| Conversação | OpenAI `gpt-4o`, conforme preferência do usuário |
| Transcrição | OpenAI `gpt-4o-mini-transcribe`, idioma `pt` |
| Síntese | ElevenLabs `eleven_multilingual_v2` |
| Voz | Sarah — Mature, Reassuring, Confident |
| Identificador da voz | `EXAVITQu4vr4xnSDxMaL` |
| Ajustes iniciais | stability `0.6`, similarity_boost `0.75`, style `0`, speed `0.95`, use_speaker_boost `false` |

Sarah foi escolhida pela descrição de voz feminina, madura, acolhedora e tranquilizadora no catálogo da conta, e por ter gerado áudio com sucesso pela API. Sua voz-base é americana; o modelo multilíngue sintetiza o texto em português. Os ajustes são uma escolha inicial de produto, não um preset clínico ou uma validação de compreensão. A amostra permite avaliar o resultado antes de integrar a voz ao app.

A candidata Yasmin (`lWq4KDY8znfkV0DrK8Vb`), identificada no catálogo como brasileira, calma e feminina, retornou HTTP 402 `payment_required` na síntese. As permissões `voices_read` e `models_read` foram habilitadas pelo usuário e a leitura dos catálogos passou a funcionar; a restrição de plano na síntese da Yasmin persistiu. Sarah funcionou com a conta atual. Nenhuma assinatura foi alterada.

## Evidências

- Amostra gerada: `../../output/audio/lia-voice-preview.mp3`, 168.898 bytes, MP3 `44100_128`.
- Texto: “Olá, eu sou a Lia, assistente virtual do OncoFlow. Estou aqui para ajudar você a organizar sua jornada, um passo de cada vez. Vamos olhar sua próxima consulta?”
- GPT-4o respondeu `teste_ok` à solicitação curta de verificação.
- O STT transcreveu a amostra com o conteúdo esperado, incluindo Lia, OncoFlow e próxima consulta; houve apenas diferença de pontuação.
- Resultado estruturado: `../../output/audio/lia-provider-check.json`.

São testes de conectividade e de um único exemplo fictício. Não avaliam confiabilidade clínica, regionalismos, compreensão por pacientes ou qualidade de transcrição em ambientes reais.

## Scripts locais

Executar na pasta `oncoflow-patient`, com Node >=22.12.0:

```powershell
node scripts/inspect-provider-options.mjs
node scripts/preview-lia-voice.mjs
node scripts/verify-lia-providers.mjs
```

O primeiro consulta metadados. Os outros fazem chamadas de síntese, resposta e transcrição, que podem consumir créditos. O teste de transcrição usa a amostra fictícia já gerada. As chaves são lidas do `.env` em memória e não aparecem nas saídas. Os arquivos de áudio e verificação ficam fora dos assets públicos do app.

## Integração Android 0.2

Após esta seleção, o usuário pediu explicitamente um MVP privado com as chaves no APK, sem servidor. A versão 0.2 usa plugins Android e HTTPS direto para conversa, captura/transcrição e síntese. O Gradle lê `.env` no build, sem copiar valores para fontes ou logs. As chaves ficam incorporadas no APK e podem ser extraídas; a distribuição deve ser restrita e as chaves revogadas após a apresentação. Não se trata de arquitetura de produção. A demo mantém dados fictícios e alertas simulados, sem equipe real.

## Documentação dos provedores

- [OpenAI: GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o)
- [OpenAI: transcrição](https://developers.openai.com/api/docs/guides/speech-to-text)
- [ElevenLabs: modelos e idiomas](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs: síntese de texto](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

Disponibilidade e restrições de conta acima foram verificadas pelas APIs autenticadas, sem registrar credenciais.
