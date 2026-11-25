package ar.jsolares.jarvis.movil;

import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * Videos, audios y miniaturas de la PC: la app los pide como https://localhost/pc/api/... y acá se le piden a la PC
 * (con el "Range" del reproductor, para poder adelantar). Así el WebView los trata como propios: sin bloqueos por
 * venir de una dirección http de la red de casa.
 */
public class JarvisWebViewClient extends BridgeWebViewClient {
    private final SharedPreferences prefs;

    public JarvisWebViewClient(Bridge bridge) {
        super(bridge);
        prefs = bridge.getContext().getSharedPreferences(Avisos.PREFS, 0);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri u = request.getUrl();
        String ruta = u.getPath();
        if ("localhost".equals(u.getHost()) && ruta != null && ruta.startsWith("/pc/api/") && "GET".equalsIgnoreCase(request.getMethod())) {
            String base = prefs.getString("base", "");
            if (!base.isEmpty()) return traer(base + u.getEncodedPath().substring(3) + (u.getEncodedQuery() != null ? "?" + u.getEncodedQuery() : ""), request.getRequestHeaders());
        }
        return super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse traer(String url, Map<String, String> pedidas) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(30000);
            for (Map.Entry<String, String> h : pedidas.entrySet()) {
                if ("range".equalsIgnoreCase(h.getKey())) c.setRequestProperty("Range", h.getValue());
            }
            int codigo = c.getResponseCode();
            InputStream cuerpo = codigo >= 400 ? c.getErrorStream() : c.getInputStream();
            if (cuerpo == null) cuerpo = new ByteArrayInputStream(new byte[0]);
            String tipo = c.getContentType() != null ? c.getContentType() : "application/octet-stream";
            String mime = tipo.split(";")[0].trim();
            Map<String, String> cab = new HashMap<>();
            for (String k : new String[]{"Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control"}) {
                String v = c.getHeaderField(k);
                if (v != null) cab.put(k, v);
            }
            String frase = codigo == 206 ? "Partial Content" : codigo == 200 ? "OK" : codigo == 404 ? "Not Found" : "Error";
            return new WebResourceResponse(mime, null, codigo, frase, cab, cuerpo);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 502, "Bad Gateway", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
        }
    }
}
