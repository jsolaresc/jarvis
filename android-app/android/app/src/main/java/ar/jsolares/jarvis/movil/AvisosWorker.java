package ar.jsolares.jarvis.movil;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Cada 15 minutos (si hay red): le pregunta a la PC qué avisos vienen y los reprograma. Si la PC no contesta, quedan los de antes. */
public class AvisosWorker extends Worker {
    public AvisosWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences p = Avisos.prefs(getApplicationContext());
        String base = p.getString("base", "");
        String publica = p.getString("publica", "");
        String token = p.getString("token", "");
        if (base.isEmpty() || token.isEmpty()) return Result.success();
        // ¿En casa? Si la PC contesta por la Wi-Fi, sí; si solo contesta por la dirección pública, estoy afuera.
        boolean enCasa = true;
        JSONObject r = pedir(base + "/api/avisos", token);
        if (r == null && !publica.isEmpty()) { enCasa = false; r = pedir(publica + "/api/avisos", token); }
        if (r == null) return Result.success();
        if (p.getBoolean("activos", true)) Avisos.programar(getApplicationContext(), r.optJSONArray("avisos") != null ? r.optJSONArray("avisos") : new org.json.JSONArray());
        enviarPresencia(enCasa ? base : publica, token, enCasa);
        AlInstanteService.aplicar(getApplicationContext()); // por si Android lo cerró
        return Result.success();
    }

    private static JSONObject pedir(String url, String token) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(10000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return new JSONObject(out.toString("UTF-8"));
        } catch (Exception e) { return null; }
    }

    private static void enviarPresencia(String base, String token, boolean enCasa) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/presencia").openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestMethod("POST");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.getOutputStream().write(("{\"enCasa\":" + enCasa + "}").getBytes("UTF-8"));
            c.getResponseCode();
        } catch (Exception ignored) {}
    }
}
