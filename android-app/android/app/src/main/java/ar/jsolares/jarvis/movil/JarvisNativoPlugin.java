package ar.jsolares.jarvis.movil;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;


import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.URL;
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
    private JSONArray archivosPendientes = null;
    private String atajoPendiente = null;

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
        if (intent == null) return;
        // Un atajo (mantener apretado el ícono, el widget o un aviso tocado).
        String atajo = intent.getStringExtra("atajo");
        if (atajo != null && !atajo.isEmpty()) {
            intent.removeExtra("atajo");
            if (avisar && hasListeners("atajo")) { JSObject r = new JSObject(); r.put("atajo", atajo); notifyListeners("atajo", r); }
            else atajoPendiente = atajo;
            return;
        }
        String accion = intent.getAction();
        // Archivos compartidos desde otra app (no texto): se mandan a la PC.
        if (Intent.ACTION_SEND_MULTIPLE.equals(accion) || (Intent.ACTION_SEND.equals(accion) && intent.getParcelableExtra(Intent.EXTRA_STREAM) != null)) {
            JSONArray lista = new JSONArray();
            java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(accion)) { java.util.ArrayList<Uri> l = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) uris.addAll(l); }
            else uris.add(intent.getParcelableExtra(Intent.EXTRA_STREAM));
            for (Uri u : uris) {
                if (u == null) continue;
                try { lista.put(describir(u)); } catch (Exception ignored) {}
            }
            intent.setAction(Intent.ACTION_MAIN);
            if (lista.length() == 0) return;
            if (avisar && hasListeners("compartidoArchivos")) { JSObject r = new JSObject(); r.put("archivos", lista); notifyListeners("compartidoArchivos", r); }
            else archivosPendientes = lista;
            return;
        }
        if (!Intent.ACTION_SEND.equals(accion)) return;
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

    // ---------- Actualizar la app desde la app ----------
    /** Baja el .apk de la Release (con progreso: evento "actualizacion") y abre el instalador de Android. */
    @PluginMethod
    public void actualizar(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/jsolaresc/jarvis/releases/")) { call.reject("Esa dirección no es de las versiones de Jarvis."); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // La primera vez Android pide permitir que Jarvis instale apps: se abre esa pantalla y se vuelve a tocar Actualizar.
            Intent permiso = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            permiso.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(permiso);
            JSObject r = new JSObject();
            r.put("permiso", false);
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            try {
                File carpeta = new File(getContext().getCacheDir(), "actualizacion");
                carpeta.mkdirs();
                File apk = new File(carpeta, "Jarvis.apk");
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new Exception("GitHub respondió " + c.getResponseCode());
                long total = c.getContentLengthLong();
                try (java.io.InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long n = 0; int ultimo = -1;
                    for (int k; (k = in.read(buf)) > 0; ) {
                        out.write(buf, 0, k);
                        n += k;
                        int pct = total > 0 ? (int) (n * 100 / total) : -1;
                        if (pct != ultimo && pct % 5 == 0) { ultimo = pct; JSObject p = new JSObject(); p.put("pct", pct); notifyListeners("actualizacion", p); }
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent instalar = new Intent(Intent.ACTION_VIEW);
                instalar.setDataAndType(uri, "application/vnd.android.package-archive");
                instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(instalar);
                JSObject r = new JSObject();
                r.put("permiso", true);
                call.resolve(r);
            } catch (Throwable t) {
                call.reject("No pude bajar la versión nueva: " + t.getMessage());
            }
        }).start();
    }

    /** "Atrás" de Android: si la app lo escucha, decide ella (true); si no, se sale. */
    public boolean avisarAtras() {
        if (!hasListeners("atras")) return false;
        notifyListeners("atras", new JSObject());
        return true;
    }

    @PluginMethod
    public void salir(PluginCall call) {
        if (getActivity() != null) getActivity().moveTaskToBack(true);
        call.resolve();
    }

    /** La PC elegida y el token (para los videos y para preguntar los avisos en segundo plano). */
    @PluginMethod
    public void configurarPC(PluginCall call) {
        boolean activos = call.getBoolean("avisos", true);
        String token = call.getString("token", "");
        String base = call.getString("base", "");
        android.content.SharedPreferences.Editor e = Avisos.prefs(getContext()).edit()
            .putString("token", token)
            .putString("publica", call.getString("publica", ""))
            .putBoolean("activos", activos)
            .putBoolean("alInstante", Boolean.TRUE.equals(call.getBoolean("alInstante", false)));
        // La dirección de casa (la pública se guarda aparte): así el trabajo de fondo sabe si está en casa o afuera.
        if (base.startsWith("http://")) e.putString("base", base);
        e.apply();
        Avisos.crearCanal(getContext());
        Avisos.seguir(getContext(), !token.isEmpty());
        AlInstanteService.aplicar(getContext());
        call.resolve();
    }

    @PluginMethod
    public void programarAvisos(PluginCall call) {
        JSONArray lista = call.getArray("avisos");
        Avisos.programar(getContext(), lista != null ? lista : new JSONArray());
        JSObject r = new JSObject();
        r.put("programados", lista != null ? lista.length() : 0);
        call.resolve(r);
    }

    @PluginMethod
    public void pedirPermisoAvisos(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
            && getContext().checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.POST_NOTIFICATIONS"}, 4701);
        }
        call.resolve();
    }

    @PluginMethod
    public void compartidoPendiente(PluginCall call) {
        JSObject r = new JSObject();
        r.put("texto", compartidoPendiente != null ? compartidoPendiente : "");
        if (archivosPendientes != null) r.put("archivos", archivosPendientes);
        compartidoPendiente = null;
        archivosPendientes = null;
        call.resolve(r);
    }

    @PluginMethod
    public void atajoPendiente(PluginCall call) {
        JSObject r = new JSObject();
        if (atajoPendiente != null) r.put("atajo", atajoPendiente);
        atajoPendiente = null;
        call.resolve(r);
    }

    /** Nombre, tamaño y tipo de un archivo compartido (content://…). */
    private JSONObject describir(Uri u) throws Exception {
        JSONObject o = new JSONObject();
        o.put("uri", u.toString());
        String nombre = null; long bytes = 0;
        try (android.database.Cursor c = getContext().getContentResolver().query(u, new String[]{android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) { nombre = c.getString(0); if (!c.isNull(1)) bytes = c.getLong(1); }
        } catch (Exception ignored) {}
        if (nombre == null) nombre = u.getLastPathSegment() != null ? u.getLastPathSegment() : "archivo";
        o.put("nombre", limpiarNombre(nombre));
        o.put("bytes", bytes);
        String mime = getContext().getContentResolver().getType(u);
        o.put("mime", mime != null ? mime : "application/octet-stream");
        return o;
    }

    /** Sube un archivo compartido directo a la PC (sin pasarlo por la página): con progreso (evento "subida"). */
    @PluginMethod
    public void subirArchivo(PluginCall call) {
        String uri = call.getString("uri", "");
        String url = call.getString("url", "");
        String token = call.getString("token", "");
        if (uri.isEmpty() || !(url.startsWith("http://") || url.startsWith("https://"))) { call.reject("Faltan datos para subir."); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                Uri u = Uri.parse(uri);
                long total = -1;
                try (android.content.res.AssetFileDescriptor fd = getContext().getContentResolver().openAssetFileDescriptor(u, "r")) { if (fd != null) total = fd.getLength(); } catch (Exception ignored) {}
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setDoOutput(true);
                c.setRequestMethod("POST");
                c.setConnectTimeout(8000);
                c.setReadTimeout(120000);
                c.setRequestProperty("Authorization", "Bearer " + token);
                c.setRequestProperty("Content-Type", "application/octet-stream");
                if (total > 0) c.setFixedLengthStreamingMode(total); else c.setChunkedStreamingMode(256 * 1024);
                try (java.io.InputStream in = getContext().getContentResolver().openInputStream(u); OutputStream out = c.getOutputStream()) {
                    if (in == null) throw new Exception("No pude leer el archivo.");
                    byte[] buf = new byte[256 * 1024];
                    long n = 0; int ultimo = -1;
                    for (int k; (k = in.read(buf)) > 0; ) {
                        out.write(buf, 0, k);
                        n += k;
                        int pct = total > 0 ? (int) (n * 100 / total) : -1;
                        if (pct != ultimo) { ultimo = pct; JSObject p = new JSObject(); p.put("uri", uri); p.put("pct", pct); notifyListeners("subida", p); }
                    }
                }
                int st = c.getResponseCode();
                java.io.InputStream resp = st < 400 ? c.getInputStream() : c.getErrorStream();
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                if (resp != null) { byte[] buf = new byte[8192]; for (int k; (k = resp.read(buf)) > 0; ) b.write(buf, 0, k); }
                JSONObject d = new JSONObject();
                try { d = new JSONObject(b.toString("UTF-8")); } catch (Exception ignored) {}
                if (st >= 300) { call.reject(d.optString("error", "La PC contestó " + st)); return; }
                call.resolve(JSObject.fromJSONObject(d));
            } catch (Throwable t) {
                call.reject(t instanceof java.io.IOException ? "Tu PC no responde." : String.valueOf(t.getMessage()));
            } finally { if (c != null) c.disconnect(); }
        }).start();
    }

    /** Wake-on-LAN: el "paquete mágico" (6 × FF y 16 veces la MAC) por broadcast en la Wi-Fi de casa. */
    @PluginMethod
    public void despertar(PluginCall call) {
        String mac = call.getString("mac", "");
        String broadcast = call.getString("broadcast", "255.255.255.255");
        String[] partes = mac.split("[:-]");
        if (partes.length != 6) { call.reject("Dirección MAC inválida."); return; }
        new Thread(() -> {
            try {
                byte[] m = new byte[6];
                for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(partes[i], 16);
                byte[] paquete = new byte[6 + 16 * 6];
                for (int i = 0; i < 6; i++) paquete[i] = (byte) 0xff;
                for (int i = 6; i < paquete.length; i += 6) System.arraycopy(m, 0, paquete, i, 6);
                try (java.net.DatagramSocket s = new java.net.DatagramSocket()) {
                    s.setBroadcast(true);
                    for (String destino : new String[]{broadcast, "255.255.255.255"}) {
                        java.net.InetAddress a = java.net.InetAddress.getByName(destino);
                        for (int puerto : new int[]{9, 7}) s.send(new java.net.DatagramPacket(paquete, paquete.length, a, puerto));
                    }
                }
                call.resolve();
            } catch (Throwable t) { call.reject("No pude mandar la señal: " + t.getMessage()); }
        }).start();
    }

    /** Huella, cara o bloqueo de pantalla (opcional, se prende en Ajustes). */
    @PluginMethod
    public void huella(PluginCall call) {
        if (getActivity() == null) { call.reject("La app no está abierta."); return; }
        int quien = Build.VERSION.SDK_INT >= 30
            ? androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK | androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
            : androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK;
        int puede = androidx.biometric.BiometricManager.from(getContext()).canAuthenticate(quien);
        if (puede != androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS && Build.VERSION.SDK_INT >= 30) { call.reject("Este celular no tiene huella ni bloqueo de pantalla configurado."); return; }
        String titulo = call.getString("titulo", "Desbloquear Jarvis");
        getActivity().runOnUiThread(() -> {
            androidx.biometric.BiometricPrompt.PromptInfo.Builder info = new androidx.biometric.BiometricPrompt.PromptInfo.Builder().setTitle(titulo);
            if (Build.VERSION.SDK_INT >= 30) info.setAllowedAuthenticators(quien);
            else info.setDeviceCredentialAllowed(true);
            androidx.biometric.BiometricPrompt p = new androidx.biometric.BiometricPrompt((androidx.fragment.app.FragmentActivity) getActivity(),
                androidx.core.content.ContextCompat.getMainExecutor(getContext()),
                new androidx.biometric.BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(androidx.biometric.BiometricPrompt.AuthenticationResult r) { JSObject o = new JSObject(); o.put("ok", true); call.resolve(o); }
                    @Override public void onAuthenticationError(int codigo, CharSequence texto) {
                        if (codigo == androidx.biometric.BiometricPrompt.ERROR_NO_BIOMETRICS || codigo == androidx.biometric.BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL || codigo == androidx.biometric.BiometricPrompt.ERROR_HW_NOT_PRESENT)
                            call.reject("Este celular no tiene huella ni bloqueo de pantalla configurado.");
                        else { JSObject o = new JSObject(); o.put("ok", false); o.put("texto", String.valueOf(texto)); call.resolve(o); }
                    }
                });
            p.authenticate(info.build());
        });
    }

    /** Avisos al instante (servicio en primer plano conectado a la PC). */
    @PluginMethod
    public void avisosAlInstante(PluginCall call) {
        boolean activo = Boolean.TRUE.equals(call.getBoolean("activo", false));
        android.content.SharedPreferences.Editor e = Avisos.prefs(getContext()).edit().putBoolean("alInstante", activo);
        String base = call.getString("base", ""); String token = call.getString("token", "");
        if (!token.isEmpty()) e.putString("token", token);
        if (!base.isEmpty() && base.startsWith("http://")) e.putString("base", base);
        e.apply();
        AlInstanteService.crearCanales(getContext());
        AlInstanteService.aplicar(getContext());
        call.resolve();
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
