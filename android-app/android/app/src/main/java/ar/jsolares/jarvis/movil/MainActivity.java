package ar.jsolares.jarvis.movil;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lo propio de Jarvis (red de casa, compartir, archivos, avisos) va antes de que arranque la app.
        registerPlugin(JarvisNativoPlugin.class);
        super.onCreate(savedInstanceState);
        // Videos y miniaturas de la PC a través de la app (ver JarvisWebViewClient).
        bridge.setWebViewClient(new JarvisWebViewClient(bridge));
        // "Atrás": lo decide la app (cierra lo abierto, vuelve a Inicio; en Inicio, sale).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                PluginHandle h = bridge.getPlugin("JarvisNativo");
                if (h != null && ((JarvisNativoPlugin) h.getInstance()).avisarAtras()) return;
                moveTaskToBack(true);
            }
        });
    }
}
