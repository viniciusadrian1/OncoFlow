package br.com.oncoflow.paciente;

/** One transient result lets a manual stop consume a recording finalized by the timer. */
final class CaptureCompletion<T> {
    private String captureId;
    private T value;

    synchronized void remember(String id, T result) {
        captureId = id;
        value = result;
    }

    synchronized T take(String id) {
        if (captureId == null || !captureId.equals(id)) return null;
        T result = value;
        clear();
        return result;
    }

    synchronized void clear() {
        captureId = null;
        value = null;
    }
}
