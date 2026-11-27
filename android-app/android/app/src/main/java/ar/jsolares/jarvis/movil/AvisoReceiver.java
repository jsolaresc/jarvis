package ar.jsolares.jarvis.movil;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;

/** Cuando llega la hora de un aviso: la notificación (tocarla abre Jarvis). También reprograma todo al reiniciar el celular. */
public class AvisoReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String accion = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(accion) || "android.intent.action.MY_PACKAGE_REPLACED".equals(accion)) {
            Avisos.reprogramar(c);
            Avisos.seguir(c, !Avisos.prefs(c).getString("token", "").isEmpty());
            AlInstanteService.aplicar(c);
            return;
        }
        if (!Avisos.prefs(c).getBoolean("activos", true)) return;
        Avisos.crearCanal(c);
        String id = intent.getStringExtra("id");
        Intent abrir = new Intent(c, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String texto = intent.getStringExtra("texto");
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, Avisos.CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setContentTitle(intent.getStringExtra("titulo"))
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi);
        try {
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id != null ? id.hashCode() : 0, n.build());
        } catch (SecurityException ignored) {} // sin permiso de notificaciones
    }
}
