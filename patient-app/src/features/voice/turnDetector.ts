/** Energy-only turn ending. Keep thresholds/timing aligned with Android TurnDetector.
 * Entry compares speech with room noise; release also follows confirmed voice energy.
 * This is an endpoint detector, not a semantic speech/noise classifier.
 */
export function createTurnDetector() {
  let previousSample = 0,
    lastVoiced = 0,
    candidateMs = 0,
    candidateLevel = 0,
    noiseFloor = 250,
    voiceLevel = 0,
    speech = false;
  let result: "listening" | "finished" | "no_speech" = "listening";
  return {
    sample(elapsedMs: number, amplitude: number) {
      if (result !== "listening") return result;
      const delta = Math.min(100, Math.max(0, elapsedMs - previousSample));
      previousSample = elapsedMs;
      const energy = Number.isFinite(amplitude) ? Math.max(0, amplitude) : 0;
      const threshold = speech
        ? Math.max(140, noiseFloor * 1.35 + 40, voiceLevel * 0.55)
        : Math.max(180, noiseFloor * 1.8 + 60);
      if (energy >= threshold) {
        candidateMs += delta;
        lastVoiced = elapsedMs;
        if (!speech) {
          // The lower onset frame prevents one handling click from setting the
          // release threshold above the person's following, quieter voice.
          candidateLevel = candidateLevel
            ? Math.min(candidateLevel, energy)
            : energy;
          if (candidateMs >= 200) {
            speech = true;
            voiceLevel = candidateLevel;
          }
        } else {
          const bounded = Math.min(voiceLevel * 2, energy);
          voiceLevel += (bounded - voiceLevel) * 0.12;
        }
      } else if (!speech) {
        const alpha = 1 - Math.exp(-delta / 600);
        noiseFloor += (energy - noiseFloor) * alpha;
        if (elapsedMs - lastVoiced >= 300) {
          candidateMs = 0;
          candidateLevel = 0;
        }
      }
      if (speech && elapsedMs - lastVoiced >= 1400) result = "finished";
      else if (!speech && elapsedMs >= 12_000) result = "no_speech";
      return result;
    },
    hasSpeech: () => speech,
  };
}
