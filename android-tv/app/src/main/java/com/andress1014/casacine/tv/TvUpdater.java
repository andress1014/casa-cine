package com.andress1014.casacine.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.widget.Toast;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** No repository credential is ever received by this component. */
final class TvUpdater {
    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService tasks = Executors.newSingleThreadExecutor();
    private boolean busy;
    private boolean foreground;
    private volatile boolean closed;
    private long lastAutomatic;
    private String lastServer = "";
    private ProgressDialog progress;
    private File pendingFile;
    private volatile File activeFile;
    private TvUpdate pendingUpdate;
    private AtomicBoolean cancelled;
    TvUpdater(Activity activity) { this.activity = activity; }
    private void ui(Runnable action) { main.post(() -> { if (!closed && !activity.isFinishing() && !activity.isDestroyed()) action.run(); }); }
    private void toast(String message) { Toast.makeText(activity,message,Toast.LENGTH_LONG).show(); }
    void check(ServerClient client, boolean manual) {
        if (closed || busy || client == null) return;
        long now = SystemClock.elapsedRealtime();
        if (!manual && lastServer.equals(client.base) && now - lastAutomatic < 6 * 60 * 60_000L) return;
        lastAutomatic = now; lastServer = client.base; busy = true;
        if (manual) toast("Buscando actualización…");
        tasks.execute(() -> {
            try {
                JSONObject response = client.checkTvUpdate();
                if (!response.optBoolean("configured")) { ui(() -> { busy = false; if (manual) toast("Configura actualizaciones en PC. Revisa guía de Guarida."); }); return; }
                JSONObject value = response.optJSONObject("update");
                if (value == null) {
                    ui(() -> { busy = false; if (manual) toast("Todavía no hay actualización publicada para TV."); }); return;
                }
                if (value.optLong("versionCode") <= BuildConfig.VERSION_CODE) {
                    ui(() -> { busy = false; if (manual) toast("Guarida " + BuildConfig.VERSION_NAME + " está actualizada."); }); return;
                }
                TvUpdate update = new TvUpdate(value);
                ui(() -> {
                    busy = false;
                    if (!foreground) return;
                    if (!manual) { toast("Guarida " + update.versionName + " disponible. Opciones → Actualizar Guarida."); return; }
                    new AlertDialog.Builder(activity).setTitle("Guarida " + update.versionName + " disponible")
                        .setMessage("Descarga e instala actualización desde este TV. Conserva conexión y preferencias.")
                        .setNegativeButton("Ahora no",(d,w) -> {})
                        .setPositiveButton("Actualizar",(d,w) -> download(client,update)).show();
                });
            } catch (ServerClient.AccessRequired error) { ui(() -> { busy = false; if (manual) toast("Vuelve a conectar e introduce código de casa."); }); }
            catch (Exception error) { ui(() -> { busy = false; if (manual) toast("No pudimos buscar actualización compatible. Revisa PC e internet e intenta de nuevo."); }); }
        });
    }
    private void download(ServerClient client, TvUpdate update) {
        if (busy || closed) return;
        busy = true; cancelled = new AtomicBoolean(); AtomicBoolean cancel = cancelled;
        progress = new ProgressDialog(activity); progress.setTitle("Actualizando Guarida");
        progress.setMessage("Descargando desde PC…"); progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progress.setMax(100); progress.setCancelable(true); progress.setOnCancelListener(d -> cancel.set(true)); progress.show();
        tasks.execute(() -> {
            File file = null;
            try {
                if (activity.getCacheDir().getUsableSpace() < update.size * 2 + 10 * 1024 * 1024L) throw new Exception("Espacio insuficiente.");
                file = File.createTempFile("guarida-update-",".apk",activity.getCacheDir());
                activeFile = file;
                if (closed || cancel.get()) throw new Exception("Cancelado.");
                client.downloadTvUpdate(update,file,cancel,percent -> ui(() -> { if (progress != null) progress.setProgress(percent); }));
                if (closed || cancel.get()) throw new Exception("Cancelado.");
                validate(file,update); File verified = file;
                ui(() -> {
                    dismissProgress(); busy = false;
                    if (cancel.get()) { verified.delete(); return; }
                    deletePending(); pendingFile = verified; pendingUpdate = update; requestInstall();
                });
                if (closed) verified.delete();
            } catch (Exception error) {
                if (file != null) file.delete();
                ui(() -> { dismissProgress(); busy = false; if (!cancel.get()) toast("No pudimos descargar APK válido. Revisa espacio, conexión y firma de versión publicada."); });
            }
        });
    }
    private void requestInstall() {
        if (pendingFile == null || pendingUpdate == null || busy || closed || !foreground) return;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity).setTitle("Permitir actualización")
                .setMessage("En Ajustes, permite que Guarida instale aplicaciones. Después vuelve aquí para continuar.")
                .setNegativeButton("Cancelar",(d,w) -> deletePending())
                .setPositiveButton("Abrir Ajustes",(d,w) -> {
                    try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:" + BuildConfig.APPLICATION_ID))); }
                    catch (Exception error) { toast("Abre Ajustes de TV → Instalar apps desconocidas → Guarida. Luego vuelve aquí."); }
                }).show();
            return;
        }
        busy = true; File file = pendingFile; TvUpdate update = pendingUpdate; pendingFile = null; pendingUpdate = null;
        tasks.execute(() -> {
            try { validate(file,update); install(file); }
            catch (Exception error) { ui(() -> toast("No pudimos iniciar instalación. Revisa permiso y espacio del TV.")); }
            finally { file.delete(); ui(() -> busy = false); }
        });
    }
    void resume() {
        foreground = true;
        if (pendingFile != null) requestInstall();
    }
    void pause() { foreground = false; }
    private Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28) return info.signingInfo == null ? new Signature[0] : info.signingInfo.getApkContentsSigners();
        return info.signatures == null ? new Signature[0] : info.signatures;
    }
    private Set<String> certificateSet(PackageInfo info) throws Exception {
        Set<String> result = new TreeSet<>();
        for (Signature signature : signatures(info)) result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        return result;
    }
    private void validate(File file, TvUpdate update) throws Exception {
        if (file.length() != update.size) throw new Exception("APK inválido.");
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(file)) { byte[] bytes = new byte[65536]; int n; while ((n = in.read(bytes)) != -1) hash.update(bytes,0,n); }
        if (!update.sha256.equals(hex(hash.digest()))) throw new Exception("APK inválido.");
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageManager pm = activity.getPackageManager();
        PackageInfo archive = pm.getPackageArchiveInfo(file.getAbsolutePath(),flags);
        PackageInfo installed = pm.getPackageInfo(BuildConfig.APPLICATION_ID,flags);
        if (archive == null || archive.applicationInfo == null || !BuildConfig.APPLICATION_ID.equals(archive.packageName) || !update.versionName.equals(archive.versionName)
            || (Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode) != update.versionCode
            || (Build.VERSION.SDK_INT >= 24 && archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT)) throw new Exception("APK incompatible.");
        Set<String> original = certificateSet(installed);
        if (original.isEmpty() || !original.equals(certificateSet(archive))) throw new Exception("Firma incompatible.");
    }
    static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT,"%02x",b & 255)); return out.toString(); }
    private void install(File file) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(BuildConfig.APPLICATION_ID); params.setSize(file.length());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        int id = installer.createSession(params); boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id);
             FileInputStream source = new FileInputStream(file);
             OutputStream output = session.openWrite("base.apk",0,file.length())) {
            byte[] bytes = new byte[65536]; int n;
            while ((n = source.read(bytes)) != -1) { if (closed || Thread.currentThread().isInterrupted()) throw new Exception("Cancelado."); output.write(bytes,0,n); }
            session.fsync(output); output.close();
            Intent result = new Intent(activity,InstallResultReceiver.class).setAction(InstallResultReceiver.ACTION);
            // PackageInstaller writes status/confirmation extras; mutable, explicit, private target.
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent callback = PendingIntent.getBroadcast(activity,id,result,flags);
            session.commit(callback.getIntentSender()); committed = true;
        } finally { if (!committed) installer.abandonSession(id); }
    }
    private void deletePending() { if (pendingFile != null) pendingFile.delete(); pendingFile = null; pendingUpdate = null; }
    private void dismissProgress() { if (progress != null) { progress.dismiss(); progress = null; } }
    void close() { closed = true; if (cancelled != null) cancelled.set(true); tasks.shutdownNow(); main.removeCallbacksAndMessages(null); dismissProgress(); deletePending(); if (activeFile != null) activeFile.delete(); }
}
