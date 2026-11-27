package ar.jsolares.jarvis.movil;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Hablarle a Jarvis desde el celular:
 * - escuchar(): el reconocimiento de voz de Android (en castellano). Va mandando "vozParcial" mientras hablás
 *   y termina con el texto final. dejarDeEscuchar() corta.
 * - hablar(): lee una respuesta en voz alta con la voz del celular. callar() la corta.
 */
@CapacitorPlugin(name = "JarvisVoz", permissions = {
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microfono")
})
public class JarvisVozPlugin extends Plugin {
    private SpeechRecognizer reconocedor;
    private PluginCall llamada;
    private TextToSpeech tts;
    private boolean ttsListo = false;
    private final Handler principal = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        r.put("escuchar", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void escuchar(PluginCall call) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "alPermiso");
            return;
        }
        empezar(call);
    }

    @PermissionCallback
    private void alPermiso(PluginCall call) {
        if (getPermissionState("microfono") == PermissionState.GRANTED) empezar(call);
        else call.reject("Sin permiso para usar el micrófono.", "SIN_PERMISO");
    }

    private void empezar(PluginCall call) {
        principal.post(() -> {
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("Este celular no tiene reconocimiento de voz.", "NO_DISPONIBLE"); return; }
            terminar(null);
            llamada = call;
            call.setKeepAlive(true);
            reconocedor = SpeechRecognizer.createSpeechRecognizer(getContext());
            reconocedor.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { notifyListeners("vozEstado", new JSObject().put("estado", "escuchando")); }
                @Override public void onBeginningOfSpeech() { notifyListeners("vozEstado", new JSObject().put("estado", "hablando")); }
                @Override public void onRmsChanged(float rms) { notifyListeners("vozNivel", new JSObject().put("nivel", rms)); }
                @Override public void onBufferReceived(byte[] b) {}
                @Override public void onEndOfSpeech() { notifyListeners("vozEstado", new JSObject().put("estado", "pensando")); }
                @Override public void onError(int error) {
                    String texto;
                    switch (error) {
                        case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: texto = "No te escuché."; break;
                        case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: texto = "El reconocimiento de voz necesita internet."; break;
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: texto = "Sin permiso para usar el micrófono."; break;
                        case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: texto = "El micrófono está ocupado."; break;
                        default: texto = "No pude escuchar (" + error + ").";
                    }
                    terminar(texto);
                }
                @Override public void onResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    PluginCall c = llamada;
                    llamada = null;
                    limpiar();
                    if (c == null) return;
                    if (r == null || r.isEmpty()) { c.reject("No te escuché.", "NADA"); return; }
                    c.resolve(new JSObject().put("texto", r.get(0)));
                }
                @Override public void onPartialResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) notifyListeners("vozParcial", new JSObject().put("texto", r.get(0)));
                }
                @Override public void onEvent(int t, Bundle b) {}
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("idioma", "es-AR"));
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            reconocedor.startListening(i);
        });
    }

    private void limpiar() {
        if (reconocedor != null) { try { reconocedor.destroy(); } catch (Exception ignored) {} reconocedor = null; }
    }

    private void terminar(String error) {
        PluginCall c = llamada;
        llamada = null;
        if (reconocedor != null) { try { reconocedor.cancel(); } catch (Exception ignored) {} }
        limpiar();
        if (c != null) { if (error != null) c.reject(error, "ERROR"); else c.resolve(new JSObject().put("texto", "")); }
    }

    @PluginMethod
    public void dejarDeEscuchar(PluginCall call) {
        principal.post(() -> {
            if (reconocedor != null) { try { reconocedor.stopListening(); } catch (Exception ignored) {} }
            call.resolve();
        });
    }

    @PluginMethod
    public void hablar(PluginCall call) {
        String texto = call.getString("texto", "");
        if (texto == null || texto.trim().isEmpty()) { call.resolve(); return; }
        if (tts == null) {
            tts = new TextToSpeech(getContext(), (estado) -> {
                ttsListo = estado == TextToSpeech.SUCCESS;
                if (ttsListo) { tts.setLanguage(new Locale("es", "AR")); decir(texto); }
            });
        } else if (ttsListo) decir(texto);
        call.resolve();
    }

    private void decir(String texto) { tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "jarvis"); }

    @PluginMethod
    public void callar(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        terminar(null);
        if (tts != null) { tts.shutdown(); tts = null; }
    }
}
