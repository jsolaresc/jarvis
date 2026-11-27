package ar.jsolares.jarvis.movil;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Los avisos de Jarvis en el celular (recordatorios y eventos): la PC dice cuáles vienen en las próximas 48 h y acá se
 * programan con el reloj de Android, así suenan aunque la app esté cerrada. Cada 15 minutos (con red) se vuelve a
 * preguntar a la PC, por si se agregó o borró algo.
 */
public final class Avisos {
    public static final String PREFS = "jarvis";
    public static final String CANAL = "avisos";
    private static final String TRABAJO = "jarvis-avisos";

    private Avisos() {}

    public static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, 0); }

    public static void crearCanal(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Recordatorios y eventos", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Los avisos de Jarvis: recordatorios y eventos del calendario.");
        c.getSystemService(NotificationManager.class).createNotificationChannel(canal);
    }

    private static PendingIntent intentoDe(Context c, String id, String titulo, String texto) {
        Intent i = new Intent(c, AvisoReceiver.class);
        i.setAction("ar.jsolares.jarvis.AVISO");
        i.putExtra("id", id);
        i.putExtra("titulo", titulo);
        i.putExtra("texto", texto);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Programa los avisos de la lista y cancela los que ya no están. */
    public static synchronized void programar(Context c, JSONArray lista) {
        SharedPreferences p = prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Set<String> antes = new HashSet<>(p.getStringSet("programados", new HashSet<>()));
        Set<String> ahora = new HashSet<>();
        long ya = System.currentTimeMillis();
        for (int k = 0; k < lista.length(); k++) {
            JSONObject a = lista.optJSONObject(k);
            if (a == null) continue;
            String id = a.optString("id", "");
            long cuando = a.optLong("cuando", 0);
            if (id.isEmpty() || cuando <= ya) continue;
            ahora.add(id);
            PendingIntent pi = intentoDe(c, id, a.optString("titulo", "Jarvis"), a.optString("texto", ""));
            boolean exacta = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
            if (exacta) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        }
        for (String id : antes) {
            if (!ahora.contains(id)) am.cancel(intentoDe(c, id, "", ""));
        }
        p.edit().putStringSet("programados", ahora).putString("lista", lista.toString()).apply();
    }

    /** Vuelve a programar lo último que se recibió (después de reiniciar el celular). */
    public static void reprogramar(Context c) {
        try { programar(c, new JSONArray(prefs(c).getString("lista", "[]"))); } catch (Exception ignored) {}
    }

    public static void seguir(Context c, boolean activos) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!prefs(c).getBoolean("activos", true)) programar(c, new JSONArray());
        if (!activos) { wm.cancelUniqueWork(TRABAJO); return; }
        Constraints red = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest p = new PeriodicWorkRequest.Builder(AvisosWorker.class, 15, TimeUnit.MINUTES).setConstraints(red).build();
        wm.enqueueUniquePeriodicWork(TRABAJO, ExistingPeriodicWorkPolicy.KEEP, p);
    }
}
