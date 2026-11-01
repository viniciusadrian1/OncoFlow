# Verificação — mute da Lia 0.11.1

31/10/2026. Android versionCode 13.

O mute agora preserva a fala que já terminou e está aguardando transcrição. O roteador aceita somente o resultado daquele item anterior ao mute, uma vez; novos itens captados durante o silêncio continuam ignorados. O transporte silencia o microfone sem apagar o turno já encaminhado. O controlador mantém a transcrição, o processamento e a reprodução, terminando no estado silenciado quando a resposta acaba. Encerrar a chamada continua cancelando os trabalhos.

Evidência RED/GREEN: os testes novos reproduziram a perda do turno e ficaram verdes com a correção. A suíte passou **271 testes unitários** e **71 E2E**, incluindo mute na transcrição pendente, no processamento com resposta atrasada e na reprodução, alternância do mute sem reconexão e prazo de transcrição preservado para evitar espera infinita. O build e a assinatura v2 do APK foram verificados.

Artefato: `OncoFlow-Paciente-demo-v0.11.1.apk`, 9.955.753 bytes.

SHA-256: `16f00861904ed98ec529e1c1b952f9183be5dcf66f43cf00ac37972790e96386`.

Logs no workspace: `output/mute-v0111-red.log`, `mute-v0111-unit.log`, `mute-v0111-e2e-final.log` e `apk/build-v0.11.1.log`. O ensaio Android usa fala fictícia e não reinicia os dados compartilhados da demonstração.

O APK final passou 14 verificações no emulador (53,8 s) com microfone virtual, Silero, transcrição real da OpenAI e reprodução real por Sarah/ElevenLabs. O botão de mute foi acionado depois do término da fala, durante seu processamento; a orientação foi produzida e reproduzida até o fim, a chamada permaneceu ativa e o microfone terminou silenciado. Evidência: `output/apk/muted-voice-native-v0.11.1.json`.
