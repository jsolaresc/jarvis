package ar.jsolares.jarvis.movil;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Lo que la app web sola no puede hacer en Android:
 * - red(): la IP del celular en la Wi-Fi, para buscar la PC en la misma red.
 * - info(): la versión instalada (para avisar cuando hay una nueva).
 * - abrir(): abrir un enlace en el navegador.
 * - compartido / compartidoPendiente(): lo que llega desde "Compartir" de otra app (un link de YouTube, por ejemplo).
 * - archivoAbrir / archivoEscribir / archivoCerrar: guardar un archivo en Descargas o compartirlo, por partes
 *   (así un video grande no se carga entero en memoria).
 */
@CapacitorPlugin(name = "JarvisNativo")
public class JarvisNativoPlugin extends Plugin {

    private String compartidoPendiente = null;

    private static class Abierto {
        String destino;
        String nombre;
        String mime;
        OutputStream salida;
        Uri uri;   // en Descargas (Android 10 o más)
        File archivo; // para compartir, o en Descargas en Android viejos
    }

    private final Map<String, Abierto> abiertos = new HashMap<>();

    @Override
    public void load() {
        if (getActivity() != null) leerIntent(getActivity().getIntent(), false);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        leerIntent(intent, true);
    }

    private void leerIntent(Intent intent, boolean avisar) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String texto = intent.getStringExtra(Intent.EXTRA_TEXT);
        String asunto = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String todo = ((asunto != null ? asunto + " " : "") + (texto != null ? texto : "")).trim();
        if (todo.isEmpty()) return;
        intent.setAction(Intent.ACTION_MAIN); // que no se vuelva a leer al girar la pantalla
        if (avisar && hasListeners("compartido")) {
            JSObject r = new JSObject();
            r.put("texto", todo);
            notifyListeners("compartido", r);
        } else {
            compartidoPendiente = todo;
        }
    }

    @PluginMethod
    public void compartidoPendiente(PluginCall call) {
        JSObject r = new JSObject();
        r.put("texto", compartidoPendiente != null ? compartidoPendiente : "");
        compartidoPendiente = null;
        call.resolve(r);
    }

    @PluginMethod
    public void red(PluginCall call) {
        JSObject r = new JSObject();
        try {
            String elegida = null;
            int prefijo = 24;
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                String nombre = ni.getName() == null ? "" : ni.getName();
                if (nombre.startsWith("tun") || nombre.startsWith("rmnet") || nombre.startsWith("ccmni")) continue; // VPN y datos móviles
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (!(ia.getAddress() instanceof Inet4Address)) continue;
                    if (!ia.getAddress().isSiteLocalAddress()) continue;
                    if (elegida == null || nombre.startsWith("wlan")) {
                        elegida = ia.getAddress().getHostAddress();
                        prefijo = ia.getNetworkPrefixLength();
                    }
                }
            }
            r.put("ip", elegida != null ? elegida : "");
            r.put("prefijo", prefijo);
        } catch (Exception e) {
            r.put("ip", "");
            r.put("prefijo", 24);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", pi.versionName);
        } catch (Exception e) {
            r.put("version", "");
        }
        r.put("android", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void abrir(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) { call.reject("Solo enlaces https."); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No hay ningún navegador para abrirlo.");
        }
    }

    private static String limpiarNombre(String n) {
        String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_").trim();
        if (s.isEmpty()) s = "archivo";
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    @PluginMethod
    public void archivoAbrir(PluginCall call) {
        Abierto a = new Abierto();
        a.destino = call.getString("destino", "descargas");
        a.nombre = limpiarNombre(call.getString("nombre", "archivo"));
        a.mime = call.getString("mime", "application/octet-stream");
        try {
            if ("compartir".equals(a.destino)) {
                File carpeta = new File(getContext().getCacheDir(), "compartir");
                // Lo compartido antes ya no hace falta.
                File[] viejos = carpeta.listFiles();
                if (viejos != null) for (File f : viejos) f.delete();
                carpeta.mkdirs();
                a.archivo = new File(carpeta, a.nombre);
                a.salida = new FileOutputStream(a.archivo);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, a.nombre);
                v.put(MediaStore.MediaColumns.MIME_TYPE, a.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Jarvis");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                ContentResolver cr = getContext().getContentResolver();
                a.uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (a.uri == null) throw new Exception("Android no dejó crear el archivo.");
                a.salida = cr.openOutputStream(a.uri);
            } else {
                // Android 9 o anterior: en la carpeta de la app (sin pedir permisos extra).
                File carpeta = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (carpeta == null) throw new Exception("No hay almacenamiento disponible.");
                carpeta.mkdirs();
                a.archivo = new File(carpeta, a.nombre);
                a.salida = new FileOutputStream(a.archivo);
            }
            String id = UUID.randomUUID().toString();
            abiertos.put(id, a);
            JSObject r = new JSObject();
            r.put("id", id);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "No pude crear el archivo.");
        }
    }

    @PluginMethod
    public void archivoEscribir(PluginCall call) {
        Abierto a = abiertos.get(call.getString("id", ""));
        if (a == null) { call.reject("Ese archivo ya no está abierto."); return; }
        try {
            a.salida.write(Base64.decode(call.getString("datos", ""), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("No pude escribir: " + e.getMessage());
        }
    }

    @PluginMethod
    public void archivoCancelar(PluginCall call) {
        Abierto a = abiertos.remove(call.getString("id", ""));
        if (a != null) {
            try { a.salida.close(); } catch (Exception ignored) {}
            if (a.uri != null) getContext().getContentResolver().delete(a.uri, null, null);
            if (a.archivo != null) a.archivo.delete();
        }
        call.resolve();
    }

    @PluginMethod
    public void archivoCerrar(PluginCall call) {
        Abierto a = abiertos.remove(call.getString("id", ""));
        if (a == null) { call.reject("Ese archivo ya no está abierto."); return; }
        try {
            a.salida.close();
            JSObject r = new JSObject();
            if ("compartir".equals(a.destino)) {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", a.archivo);
                Intent enviar = new Intent(Intent.ACTION_SEND);
                enviar.setType(a.mime);
                enviar.putExtra(Intent.EXTRA_STREAM, uri);
                enviar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent elegir = Intent.createChooser(enviar, null);
                elegir.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(elegir);
                r.put("donde", "compartir");
            } else if (a.uri != null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(a.uri, v, null, null);
                r.put("donde", "Descargas/Jarvis");
            } else {
                r.put("donde", a.archivo.getParent());
            }
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No pude terminar: " + e.getMessage());
        }
    }
}
