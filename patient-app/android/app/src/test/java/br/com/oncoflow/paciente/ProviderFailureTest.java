package br.com.oncoflow.paciente;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

public class ProviderFailureTest {
    @Test public void quotaStatusIn401IsAServiceLimitRatherThanInvalidAuthorization() {
        assertEquals("PROVIDER_LIMIT", ProviderFailure.classify(401,
            "{\"detail\":{\"status\":\"quota_exceeded\",\"message\":\"Insufficient credits\"}}"));
        assertEquals("PROVIDER_LIMIT", ProviderFailure.classify(401, "{\"error\": { \"code\" : \"quota_exceeded\" }}"));
    }

    @Test public void real401AuthorizationIsPreservedAndMessageWordsCannotChangeIt() throws Exception {
        assertEquals("AUTH_FAILED", ProviderFailure.classify(401,
            "{\"detail\":{\"status\":\"invalid_api_key\",\"message\":\"quota_exceeded is a different error\"}}"));
        assertEquals("AUTH_FAILED", ProviderFailure.classify(401,
            "{\"message\":\"Example: \\\"status\\\":\\\"quota_exceeded\\\"\"}"));
        String oversized = " ".repeat(ProviderFailure.MAX_ERROR_BYTES) + "{\"status\":\"quota_exceeded\"}";
        String limited = ProviderFailure.readLimited(new ByteArrayInputStream(oversized.getBytes(StandardCharsets.UTF_8)));
        assertEquals(8192, limited.length());
        assertEquals("AUTH_FAILED", ProviderFailure.classify(401, limited));
    }

    @Test public void rateLimitingRemainsAServiceLimitWithoutReadableJson() {
        assertEquals("PROVIDER_LIMIT", ProviderFailure.classify(429, ""));
        assertEquals("PROVIDER_LIMIT", ProviderFailure.classify(429, "{\"detail\":{\"status\":\"quota_exceeded\"}}"));
    }

    @Test public void forbiddenRemainsAuthorizationFailure() {
        assertEquals("AUTH_FAILED", ProviderFailure.classify(403, "{\"detail\":{\"status\":\"quota_exceeded\"}}"));
    }

    @Test public void serverFailuresRemainUnavailableAndDoNotExposeTheBody() {
        assertEquals("PROVIDER_UNAVAILABLE", ProviderFailure.classify(503, "{\"detail\":{\"status\":\"quota_exceeded\"}}"));
        assertEquals("PROVIDER_UNAVAILABLE", ProviderFailure.classify(503, null));
    }
}
