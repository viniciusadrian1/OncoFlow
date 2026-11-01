package br.com.oncoflow.paciente;

/** Energy-based endpoints, not a semantic speech classifier. Keep aligned with turnDetector.ts. */
final class TurnDetector {
    enum Result { LISTENING, FINISHED, NO_SPEECH }
    static final int SILENCE_MS = 1400;
    static final int NO_SPEECH_MS = 12_000;
    private long previousSample;
    private long lastVoiced;
    private long candidateMs;
    private double candidateLevel;
    private double noiseFloor = 250;
    private double voiceLevel;
    private boolean speech;
    private Result result = Result.LISTENING;

    Result sample(long elapsedMs, int amplitude) {
        if (result != Result.LISTENING) return result;
        long delta = Math.min(100, Math.max(0, elapsedMs - previousSample));
        previousSample = elapsedMs;
        double energy = Math.max(0, amplitude);
        double threshold = speech
            ? Math.max(140, Math.max(noiseFloor * 1.35 + 40, voiceLevel * 0.55))
            : Math.max(180, noiseFloor * 1.8 + 60);
        if (energy >= threshold) {
            candidateMs += delta;
            lastVoiced = elapsedMs;
            if (!speech) {
                // One handling click must not set the threshold above the following voice.
                candidateLevel = candidateLevel > 0 ? Math.min(candidateLevel, energy) : energy;
                if (candidateMs >= 200) {
                    speech = true;
                    voiceLevel = candidateLevel;
                }
            } else {
                double bounded = Math.min(voiceLevel * 2, energy);
                voiceLevel += (bounded - voiceLevel) * 0.12;
            }
        } else if (!speech) {
            double alpha = 1 - Math.exp(-delta / 600.0);
            noiseFloor += (energy - noiseFloor) * alpha;
            if (elapsedMs - lastVoiced >= 300) {
                candidateMs = 0;
                candidateLevel = 0;
            }
        }
        if (speech && elapsedMs - lastVoiced >= SILENCE_MS) result = Result.FINISHED;
        else if (!speech && elapsedMs >= NO_SPEECH_MS) result = Result.NO_SPEECH;
        return result;
    }

    boolean hasSpeech() { return speech; }
}
