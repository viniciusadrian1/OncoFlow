package br.com.oncoflow.paciente;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Map;

public class TranscriptionRequestTest {
    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Map<String, Object> parent, String key) {
        return (Map<String, Object>) parent.get(key);
    }

    @Test public void realtimeRequestSendsOnlyTranscriptionWithNoiseReductionAndPortugueseGuidance() {
        Map<String, Object> body = TranscriptionRequest.realtimeSession("gpt-4o-transcribe", false);
        assertEquals(Map.of("anchor", "created_at", "seconds", 60), object(body, "expires_after"));
        Map<String, Object> session = object(body, "session");
        assertEquals("transcription", session.get("type"));
        assertEquals(2, session.size()); // No chat history or assistant instructions.
        Map<String, Object> input = object(object(session, "audio"), "input");
        assertEquals(Map.of("type", "near_field"), object(input, "noise_reduction"));
        assertEquals(Map.of("type", "server_vad", "threshold", 0.5,
            "silence_duration_ms", 600, "prefix_padding_ms", 300), object(input, "turn_detection"));
        assertEquals(Map.of("model", "gpt-4o-transcribe", "language", "pt",
            "prompt", "Conversa em português do Brasil no aplicativo OncoFlow com a assistente Lia sobre agenda, consultas, exames e documentos. "
                + "Transcreva somente a fala audível, preservando negações e correções. Não complete trechos inaudíveis nem acrescente informações."),
            object(input, "transcription"));
    }

    @Test public void fileAndRealtimeRequestsShareEnglishGuidanceAndRespectConfiguredModel() {
        Map<String, Object> session = object(TranscriptionRequest.realtimeSession("gpt-4o-mini-transcribe", true), "session");
        Map<String, Object> realtime = object(object(object(session, "audio"), "input"), "transcription");
        Map<String, String> file = TranscriptionRequest.fileFields("gpt-4o-mini-transcribe", true);
        assertEquals(Map.of("model", "gpt-4o-mini-transcribe", "language", "en",
            "prompt", "Conversation in US English in the OncoFlow app with the assistant Lia about schedules, appointments, tests and documents. "
                + "Transcribe only audible speech, preserving negations and corrections. Do not complete inaudible passages or add information."), file);
        assertEquals(file, realtime);
    }
}
