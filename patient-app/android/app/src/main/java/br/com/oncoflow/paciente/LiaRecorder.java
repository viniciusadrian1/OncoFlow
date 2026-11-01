package br.com.oncoflow.paciente;

import android.Manifest;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

/** Foreground-only, bounded microphone capture. No transcript or audio is logged. */
@CapacitorPlugin(name = "LiaRecorder", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class LiaRecorder extends Plugin {
    private static final int LIMIT_MS = 30_000;
    private static final int MAX_BYTES = 1_000_000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaRecorder recorder;
    private File audioFile;
    private PluginCall pendingStart;
    private String captureId;
    private long startedAt;
    private TurnDetector turnDetector;
    private final CaptureCompletion<JSObject> completion = new CaptureCompletion<>();
    private final Runnable timeout = () -> finishAutomatically();
    private final Runnable expireCompletion = () -> completion.clear();
    private final Runnable amplitudePoll = () -> pollAmplitude();

    @Override
    public void load() {
        // Only remove this plugin's abandoned temporary files after process death.
        File[] leftovers = getContext().getCacheDir().listFiles((directory, name) -> name.startsWith("lia-recording-") && name.endsWith(".m4a"));
        if (leftovers != null) for (File file : leftovers) file.delete();
    }

    @PluginMethod
    public synchronized void start(PluginCall call) {
        if (recorder != null || pendingStart != null) { call.reject("Já existe uma gravação em andamento.", "CAPTURE_BUSY"); return; }
        clearCompletion();
        captureId = call.getString("captureId");
        if (captureId == null || captureId.length() > 80) { call.reject("Identificador de gravação inválido.", "CAPTURE_INVALID"); return; }
        pendingStart = call;
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "permissionResult");
        } else {
            begin(call);
        }
    }

    @PermissionCallback
    private synchronized void permissionResult(PluginCall call) {
        if (pendingStart != call) return; // Explicit cancellation while the dialog was visible.
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            pendingStart = null;
            call.reject("Microfone não autorizado. Você pode escrever sua mensagem.", "MICROPHONE_DENIED");
            return;
        }
        begin(call);
    }

    @SuppressWarnings("deprecation")
    private synchronized void begin(PluginCall call) {
        if (pendingStart != call) return;
        try {
            audioFile = File.createTempFile("lia-recording-", ".m4a", getContext().getCacheDir());
            recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new MediaRecorder(getContext()) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(44_100);
            recorder.setAudioEncodingBitRate(64_000);
            recorder.setOutputFile(audioFile.getAbsolutePath());
            recorder.setMaxDuration(LIMIT_MS);
            recorder.setMaxFileSize(MAX_BYTES);
            recorder.setOnInfoListener((source, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) finishAutomatically();
            });
            recorder.setOnErrorListener((source, what, extra) -> recordingFailed());
            recorder.prepare();
            recorder.start();
            startedAt = SystemClock.elapsedRealtime();
            // Permission UI can pause the Activity and discard previous state.
            // Restore the option from this request only after recording really starts.
            turnDetector = call.getBoolean("autoStopOnSilence", false) ? new TurnDetector() : null;
            // getMaxAmplitude() is 0 on its first call; prime it before periodic sampling.
            recorder.getMaxAmplitude();
            handler.postDelayed(amplitudePoll, 100);
            handler.postDelayed(timeout, LIMIT_MS);
            pendingStart = null;
            call.resolve();
        } catch (Exception error) {
            pendingStart = null;
            discard();
            call.reject("Não foi possível iniciar o microfone. Tente novamente.", "CAPTURE_START_FAILED");
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        if (captureId == null || !captureId.equals(call.getString("captureId"))) { call.reject("Não há gravação ativa.", "CAPTURE_INACTIVE"); return; }
        if (recorder == null) {
            JSObject buffered = completion.take(captureId);
            if (buffered == null) { call.reject("Não há gravação ativa.", "CAPTURE_INACTIVE"); return; }
            handler.removeCallbacks(expireCompletion);
            call.resolve(buffered);
            return;
        }
        // An explicit stop may rescue a quiet utterance the energy gate missed.
        // Only automatic completion discards a turn classified as silence.
        try { call.resolve(finish()); }
        catch (Exception error) { discard(); call.reject("Não foi possível obter áudio. Fale por mais tempo e tente novamente.", "CAPTURE_EMPTY"); }
    }

    private synchronized JSObject finish() throws Exception {
        if (recorder == null) throw new IllegalStateException("inactive");
        long duration = Math.max(1, Math.min(LIMIT_MS, SystemClock.elapsedRealtime() - startedAt));
        handler.removeCallbacks(timeout);
        handler.removeCallbacks(amplitudePoll);
        MediaRecorder active = recorder;
        recorder = null;
        try {
            active.setOnInfoListener(null);
            active.setOnErrorListener(null);
            active.stop();
        } finally {
            active.release();
        }
        try {
            if (audioFile == null || audioFile.length() <= 0 || audioFile.length() > MAX_BYTES) throw new IllegalStateException("invalid audio");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (FileInputStream input = new FileInputStream(audioFile)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > MAX_BYTES) throw new IllegalStateException("audio too large");
                    bytes.write(buffer, 0, count);
                }
            }
            JSObject result = new JSObject();
            result.put("base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            result.put("mimeType", "audio/mp4");
            result.put("durationMs", duration);
            result.put("captureId", captureId);
            return result;
        } finally {
            deleteAudioFile();
        }
    }

    private synchronized void finishAutomatically() {
        if (recorder == null) return;
        if (turnDetector != null && !turnDetector.hasSpeech()) { noSpeech(); return; }
        try {
            JSObject audio = finish();
            completion.remember(captureId, audio);
            handler.postDelayed(expireCompletion, LIMIT_MS);
            notifyListeners("recordingStopped", audio);
        }
        catch (Exception error) { discard(); emitError("CAPTURE_EMPTY"); }
    }

    private synchronized void pollAmplitude() {
        if (recorder == null) return;
        try {
            long elapsed = SystemClock.elapsedRealtime() - startedAt;
            int amplitude = recorder.getMaxAmplitude();
            TurnDetector.Result result = turnDetector == null
                ? TurnDetector.Result.LISTENING : turnDetector.sample(elapsed, amplitude);
            JSObject level = new JSObject();
            level.put("captureId", captureId);
            level.put("level", Math.min(1, Math.sqrt(Math.max(0, amplitude) / 32767.0)));
            level.put("speech", turnDetector != null && turnDetector.hasSpeech());
            level.put("elapsedMs", elapsed);
            notifyListeners("recordingLevel", level);
            if (result == TurnDetector.Result.FINISHED) { finishAutomatically(); return; }
            if (result == TurnDetector.Result.NO_SPEECH) { noSpeech(); return; }
            handler.postDelayed(amplitudePoll, 100);
        } catch (RuntimeException error) {
            recordingFailed();
        }
    }

    private synchronized void noSpeech() {
        discard();
        emitError("NO_SPEECH");
    }

    private synchronized void recordingFailed() {
        if (recorder == null) return;
        discard();
        emitError("CAPTURE_FAILED");
    }

    @PluginMethod
    public synchronized void cancel(PluginCall call) {
        if (captureId == null || !captureId.equals(call.getString("captureId"))) { call.resolve(); return; }
        cancelPending();
        discard();
        captureId = null;
        call.resolve();
    }

    private void cancelPending() {
        if (pendingStart != null) {
            pendingStart.reject("Gravação cancelada.", "CAPTURE_CANCELLED");
            pendingStart = null;
        }
    }

    private void deleteAudioFile() {
        if (audioFile != null) { audioFile.delete(); audioFile = null; }
    }

    private synchronized void discard() {
        handler.removeCallbacks(timeout);
        handler.removeCallbacks(amplitudePoll);
        turnDetector = null;
        clearCompletion();
        if (recorder != null) {
            MediaRecorder active = recorder;
            recorder = null;
            active.setOnInfoListener(null);
            active.setOnErrorListener(null);
            try { active.stop(); } catch (RuntimeException ignored) {}
            active.release();
        }
        deleteAudioFile();
    }

    private void clearCompletion() {
        handler.removeCallbacks(expireCompletion);
        completion.clear();
    }

    private void emitError(String code) {
        JSObject event = new JSObject();
        event.put("code", code);
        event.put("captureId", captureId);
        notifyListeners("recordingError", event);
    }

    @Override
    protected synchronized void handleOnPause() {
        boolean wasRecording = recorder != null;
        // Permission dialogs can pause the Activity: do not cancel that initial request here.
        // Explicit cancel()/destroy still rejects a pending start.
        discard();
        if (wasRecording) emitError("CAPTURE_CANCELLED");
    }

    @Override
    protected synchronized void handleOnDestroy() {
        cancelPending();
        discard();
    }

    @Override
    protected synchronized void handleOnStop() {
        cancelPending();
        boolean wasRecording = recorder != null;
        discard();
        if (wasRecording) emitError("CAPTURE_CANCELLED");
    }
}
