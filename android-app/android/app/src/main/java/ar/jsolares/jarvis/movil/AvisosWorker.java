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
        String token = p.getString("token", "");
        if (base.isEmpty() || token.isEmpty() || !p.getBoolean("activos", true)) return Result.success();
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/avisos").openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(10000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (c.getResponseCode() != 200) return Result.success();
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            JSONObject r = new JSONObject(out.toString("UTF-8"));
            Avisos.programar(getApplicationContext(), r.optJSONArray("avisos") != null ? r.optJSONArray("avisos") : new org.json.JSONArray());
        } catch (Exception ignored) {}
        return Result.success();
    }
}
