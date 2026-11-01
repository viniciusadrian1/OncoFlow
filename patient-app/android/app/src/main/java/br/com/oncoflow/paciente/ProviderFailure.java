package br.com.oncoflow.paciente;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** Pure classification of provider failures. Returns application codes only. */
final class ProviderFailure {
    static final int MAX_ERROR_BYTES = 8192;
    // Match a structured field, not an occurrence inside the provider's message text.
    private static final Pattern QUOTA_STATUS = Pattern.compile(
        "(?<!\\\\)\"(?:status|code)\"\\s*:\\s*\"quota_exceeded\"\\s*(?=[,}])");

    private ProviderFailure() {}

    static String classify(int status, String boundedErrorBody) {
        if (status == 401 && boundedErrorBody != null &&
            QUOTA_STATUS.matcher(boundedErrorBody.substring(0, Math.min(boundedErrorBody.length(), MAX_ERROR_BYTES))).find())
            return "PROVIDER_LIMIT";
        if (status == 401 || status == 403) return "AUTH_FAILED";
        if (status == 402 || status == 429) return "PROVIDER_LIMIT";
        return "PROVIDER_UNAVAILABLE";
    }

    /** Consumes at most 8 KiB and closes the error stream. Nothing is logged or retained. */
    static String readLimited(InputStream errorStream) throws IOException {
        if (errorStream == null) return "";
        try (InputStream input = errorStream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            while (bytes.size() < MAX_ERROR_BYTES) {
                int count = input.read(buffer, 0, Math.min(buffer.length, MAX_ERROR_BYTES - bytes.size()));
                if (count == -1) break;
                bytes.write(buffer, 0, count);
            }
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
