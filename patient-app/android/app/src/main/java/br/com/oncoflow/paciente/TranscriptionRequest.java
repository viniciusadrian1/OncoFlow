package br.com.oncoflow.paciente;

import java.util.LinkedHashMap;
import java.util.Map;

/** Provider request fields only. No credentials, patient context or chat history. */
final class TranscriptionRequest {
    private TranscriptionRequest() {}

    static Map<String, String> fileFields(String model, boolean english) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("model", model);
        fields.put("language", english ? "en" : "pt");
        // App vocabulary disambiguates names without seeding a list of symptoms.
        fields.put("prompt", english
            ? "Conversation in US English in the OncoFlow app with the assistant Lia about schedules, appointments, tests and documents. "
                + "Transcribe only audible speech, preserving negations and corrections. Do not complete inaudible passages or add information."
            : "Conversa em português do Brasil no aplicativo OncoFlow com a assistente Lia sobre agenda, consultas, exames e documentos. "
                + "Transcreva somente a fala audível, preservando negações e correções. Não complete trechos inaudíveis nem acrescente informações.");
        return fields;
    }

    static Map<String, Object> realtimeSession(String model, boolean english) {
        return object(
            "expires_after", object("anchor", "created_at", "seconds", 60),
            "session", object("type", "transcription", "audio", object("input", object(
                "noise_reduction", object("type", "near_field"),
                "transcription", fileFields(model, english),
                "turn_detection", object("type", "server_vad", "threshold", 0.5,
                    "silence_duration_ms", 600, "prefix_padding_ms", 300)))));
    }

    private static Map<String, Object> object(Object... fields) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < fields.length; i += 2) result.put((String) fields[i], fields[i + 1]);
        return result;
    }
}
