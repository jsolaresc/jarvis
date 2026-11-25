package ar.jsolares.jarvis.movil;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lo propio de Jarvis (red de casa, compartir, guardar archivos) va antes de que arranque la app.
        registerPlugin(JarvisNativoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
