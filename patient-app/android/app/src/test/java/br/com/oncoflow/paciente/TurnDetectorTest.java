package br.com.oncoflow.paciente;

import org.junit.Test;
import static org.junit.Assert.*;

public class TurnDetectorTest {
    private void assertEndsAboveBackground(int before, int voice, int after) {
        TurnDetector detector = new TurnDetector();
        for (int ms = 100; ms <= 2000; ms += 100) detector.sample(ms, before);
        assertFalse(detector.hasSpeech());
        for (int ms = 2100; ms <= 5000; ms += 100)
            assertEquals(TurnDetector.Result.LISTENING, detector.sample(ms, voice));
        assertTrue(detector.hasSpeech());
        for (int ms = 5100; ms < 6400; ms += 100)
            assertEquals(TurnDetector.Result.LISTENING, detector.sample(ms, after));
        assertEquals(TurnDetector.Result.FINISHED, detector.sample(6400, after));
    }
    @Test public void lowVoiceAboveQuietBackgroundIsNotDiscarded() {
        assertEndsAboveBackground(80, 650, 80);
    }
    @Test public void voiceAboveSteadyRoomNoiseIsNotLearnedAsNoise() {
        assertEndsAboveBackground(500, 1100, 500);
    }
    @Test public void residualNoiseAfterSpeechDoesNotHoldTheTurnOpen() {
        assertEndsAboveBackground(80, 1800, 800);
    }
    @Test public void immediateSoftSpeechDoesNotRequireACalibrationPause() {
        TurnDetector detector = new TurnDetector();
        detector.sample(100, 650);
        detector.sample(200, 650);
        assertTrue(detector.hasSpeech());
        assertEquals(TurnDetector.Result.FINISHED, detector.sample(1600, 80));
    }
    @Test public void anIsolatedPeakDoesNotMakeFollowingSpeechLookSilent() {
        TurnDetector detector = new TurnDetector();
        detector.sample(100, 18000);
        for (int ms = 200; ms <= 3000; ms += 100)
            assertEquals(TurnDetector.Result.LISTENING, detector.sample(ms, 650));
        assertTrue(detector.hasSpeech());
        assertEquals(TurnDetector.Result.FINISHED, detector.sample(4400, 80));
    }
    @Test public void waitsThroughInitialSilenceWithoutSubmittingIt() {
        TurnDetector detector = new TurnDetector();
        assertEquals(TurnDetector.Result.LISTENING, detector.sample(100, 0));
        assertEquals(TurnDetector.Result.LISTENING, detector.sample(11_900, 80));
        assertEquals(TurnDetector.Result.NO_SPEECH, detector.sample(12_000, 0));
        assertFalse(detector.hasSpeech());
    }
    @Test public void preservesShortPausesAndStopsAfterCompletedSpeech() {
        TurnDetector detector = new TurnDetector();
        detector.sample(100, 1800);
        detector.sample(200, 2000);
        assertTrue(detector.hasSpeech());
        assertEquals(TurnDetector.Result.LISTENING, detector.sample(1000, 0));
        assertEquals(TurnDetector.Result.LISTENING, detector.sample(1100, 1500));
        assertEquals(TurnDetector.Result.LISTENING, detector.sample(2400, 0));
        assertEquals(TurnDetector.Result.FINISHED, detector.sample(2500, 0));
    }
    @Test public void oneBriefClickIsNotSpeech() {
        TurnDetector detector = new TurnDetector();
        detector.sample(100, 15_000);
        detector.sample(200, 0);
        detector.sample(300, 0);
        detector.sample(400, 0);
        detector.sample(500, 0);
        assertFalse(detector.hasSpeech());
        assertEquals(TurnDetector.Result.NO_SPEECH, detector.sample(12_000, 0));
    }
    @Test public void quietBackgroundDoesNotCreateAnUtteranceAndSpeechCanStartImmediately() {
        TurnDetector detector = new TurnDetector();
        for (int ms = 100; ms <= 2000; ms += 100) detector.sample(ms, 300);
        assertFalse(detector.hasSpeech());
        detector.sample(2100, 2100);
        detector.sample(2200, 1900);
        assertTrue(detector.hasSpeech());
    }
    @Test public void aNewDetectorDoesNotInheritAnEarlierTurn() {
        TurnDetector old = new TurnDetector();
        old.sample(100, 1000); old.sample(200, 1000);
        assertTrue(old.hasSpeech());
        TurnDetector next = new TurnDetector();
        assertFalse(next.hasSpeech());
        assertEquals(TurnDetector.Result.LISTENING, next.sample(2000, 0));
    }
}
