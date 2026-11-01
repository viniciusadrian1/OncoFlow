package br.com.oncoflow.paciente;

import org.junit.Test;
import static org.junit.Assert.*;

public class CaptureCompletionTest {
    @Test public void manualStopConsumesTimerResultExactlyOnce() {
        CaptureCompletion<String> completed = new CaptureCompletion<>();
        completed.remember("capture-1", "audio");
        assertEquals("audio", completed.take("capture-1"));
        assertNull(completed.take("capture-1"));
    }

    @Test public void differentCaptureCannotConsumePreviousRecording() {
        CaptureCompletion<String> completed = new CaptureCompletion<>();
        completed.remember("capture-1", "audio");
        assertNull(completed.take("capture-2"));
        assertEquals("audio", completed.take("capture-1"));
    }

    @Test public void cancellationAndExpiryDiscardTheResult() {
        CaptureCompletion<String> completed = new CaptureCompletion<>();
        completed.remember("capture-1", "audio");
        completed.clear();
        assertNull(completed.take("capture-1"));
    }
}
