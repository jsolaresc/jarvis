package ar.jsolares.jarvis.movil;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Avisos al instante (opcional, se prende en Ajustes del celular): queda conectado a la PC con una espera larga
 * (/api/novedades) y muestra en el momento lo que la PC avisa: movimiento en la cámara, rutinas que se hicieron solas…
 * Android exige una notificación fija mientras corre (en un canal silencioso que se puede ocultar).
 */
public class AlInstanteService extends Service {
    static final String CANAL_FIJO = "conexion";
    static final String CANAL = "al-instante";
    private volatile boolean seguir = false;
    private Thread hilo;

    public static void aplicar(Context c) {
        SharedPreferences p = Avisos.prefs(c);
        boolean activo = p.getBoolean("alInstante", false) && !p.getString("token", "").isEmpty();
        Intent i = new Intent(c, AlInstanteService.class);
        try {
            if (activo) { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); }
            else c.stopService(i);
        } catch (Exception ignored) {} // Android no deja arrancarlo ahora (por ejemplo, en segundo plano): se prende al abrir la app
    }

    static void crearCanales(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel fijo = new NotificationChannel(CANAL_FIJO, "Conexión con la PC", NotificationManager.IMPORTANCE_MIN);
        fijo.setDescription("La notificación fija de los avisos al instante. Se puede ocultar.");
        nm.createNotificationChannel(fijo);
        NotificationChannel avisos = new NotificationChannel(CANAL, "Avisos al instante", NotificationManager.IMPORTANCE_HIGH);
        avisos.setDescription("Movimiento en la cámara de seguridad, rutinas que se hicieron solas y otros avisos de la PC.");
        nm.createNotificationChannel(avisos);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanales(this);
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification n = new NotificationCompat.Builder(this, CANAL_FIJO)
            .setSmallIcon(R.drawable.ic_aviso)
            .setContentTitle("Jarvis está atento a tu PC")
            .setContentText("Para avisarte al instante (lo apagás en Ajustes de la app).")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 1, abrir, PendingIntent.FLAG_IMMUTABLE))
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(4702, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(4702, n);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Avisos.prefs(this).getBoolean("alInstante", false)) { stopSelf(); return START_NOT_STICKY; }
        if (hilo == null || !hilo.isAlive()) {
            seguir = true;
            hilo = new Thread(this::escuchar, "jarvis-al-instante");
            hilo.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() { seguir = false; if (hilo != null) hilo.interrupt(); super.onDestroy(); }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private static String leer(HttpURLConnection c) throws Exception {
        InputStream in = c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    private void escuchar() {
        long desde = -1;
        int espera = 5000;
        boolean porAfuera = false;
        while (seguir) {
            SharedPreferences p = Avisos.prefs(this);
            if (!p.getBoolean("alInstante", false)) break;
            String token = p.getString("token", "");
            String base = porAfuera ? p.getString("publica", "") : p.getString("base", "");
            if (base.isEmpty()) base = p.getString("base", "");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/novedades?desde=" + Math.max(0, desde)).openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(40000);
                c.setRequestProperty("Authorization", "Bearer " + token);
                int st = c.getResponseCode();
                if (st == 401) { p.edit().putBoolean("alInstante", false).apply(); break; } // desvinculado
                if (st != 200) throw new Exception("status " + st);
                JSONObject r = new JSONObject(leer(c));
                long hasta = r.optLong("hasta", 0);
                if (desde >= 0) {
                    JSONArray evs = r.optJSONArray("eventos");
                    if (evs != null) for (int k = 0; k < evs.length(); k++) mostrar(evs.optJSONObject(k));
                }
                desde = hasta;
                espera = 5000;
            } catch (Exception e) {
                if (!seguir) break;
                // ¿Estoy afuera? Se prueba la dirección pública (Tailscale Funnel) y vuelta.
                if (!p.getString("publica", "").isEmpty()) porAfuera = !porAfuera;
                try { Thread.sleep(espera); } catch (InterruptedException ie) { break; }
                espera = Math.min(60000, espera * 2);
            }
        }
        stopSelf();
    }

    private void mostrar(JSONObject ev) {
        if (ev == null || !"aviso".equals(ev.optString("tipo"))) return;
        JSONObject d = ev.optJSONObject("dato");
        if (d == null) return;
        String tipo = d.optString("tipo", "aviso");
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if ("movimiento".equals(tipo)) abrir.putExtra("atajo", "camara");
        PendingIntent pi = PendingIntent.getActivity(this, d.optString("id", "").hashCode(), abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String texto = d.optString("texto", "");
        NotificationCompat.Builder n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setContentTitle(d.optString("titulo", "Jarvis"))
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory("movimiento".equals(tipo) ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(pi);
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(d.optString("id", String.valueOf(System.currentTimeMillis())).hashCode(), n.build()); }
        catch (SecurityException ignored) {}
    }
}
