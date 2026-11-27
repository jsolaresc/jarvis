package ar.jsolares.jarvis.movil;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Widget de la pantalla de inicio de Android: Hablar, Cámara, Guardar clip y Control de la PC, de un toque. */
public class JarvisWidget extends AppWidgetProvider {
    private static PendingIntent atajo(Context c, String que, int n) {
        Intent i = new Intent(c, MainActivity.class).setAction("ar.jsolares.jarvis.ATAJO." + que)
            .putExtra("atajo", que).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 4800 + n, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager am, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_jarvis);
            v.setOnClickPendingIntent(R.id.w_hablar, atajo(c, "hablar", 1));
            v.setOnClickPendingIntent(R.id.w_camara, atajo(c, "camara", 2));
            v.setOnClickPendingIntent(R.id.w_clip, atajo(c, "clip", 3));
            v.setOnClickPendingIntent(R.id.w_control, atajo(c, "control", 4));
            am.updateAppWidget(id, v);
        }
    }
}
