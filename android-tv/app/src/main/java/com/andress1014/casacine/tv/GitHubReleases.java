package com.andress1014.casacine.tv;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Reads TV releases straight from the public GitHub repository; the Windows PC is not involved. */
final class GitHubReleases {
    static final String REPOSITORY = "andress1014/casa-cine";
    private static final String LATEST = "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";
    static final String DOWNLOADS = "https://github.com/" + REPOSITORY + "/releases/download/";
    private GitHubReleases() {}
    static final class UpToDate extends Exception {}

    private static HttpURLConnection open(String url, String accept) throws Exception {
        if (!url.startsWith("https://")) throw new Exception("Origen no permitido.");
        HttpURLConnection request = (HttpURLConnection) new URL(url).openConnection();
        request.setConnectTimeout(10000); request.setReadTimeout(30000); request.setInstanceFollowRedirects(true);
        request.setRequestProperty("Accept", accept);
        request.setRequestProperty("User-Agent", "Guarida-TV/" + BuildConfig.VERSION_NAME);
        return request;
    }
    private static String text(String url, String accept, int limit) throws Exception {
        HttpURLConnection request = open(url, accept);
        try {
            int status = request.getResponseCode();
            if (status == 404) return null;
            if (status != 200) throw new Exception("GitHub respondió " + status + ".");
            try (InputStream input = request.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[16384]; int n;
                while ((n = input.read(bytes)) != -1) { out.write(bytes, 0, n); if (out.size() > limit) throw new Exception("Respuesta demasiado grande."); }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally { request.disconnect(); }
    }
    /** Newest stable release carrying tv-update.json plus its APK, or null when none is published. */
    static TvUpdate latest() throws Exception {
        String body = text(LATEST, "application/vnd.github+json", 512 * 1024);
        if (body == null) return null;
        JSONObject release = new JSONObject(body);
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) return null;
        String tag = release.getString("tag_name");
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null || !tag.matches("[A-Za-z0-9._-]{1,60}")) return null;
        boolean hasManifest = false;
        for (int i = 0; i < assets.length(); i++) if ("tv-update.json".equals(assets.getJSONObject(i).optString("name"))) hasManifest = true;
        if (!hasManifest) return null;
        String manifest = text(DOWNLOADS + tag + "/tv-update.json", "application/octet-stream", 16 * 1024);
        if (manifest == null) return null;
        JSONObject value = new JSONObject(manifest);
        if (value.optLong("versionCode") <= BuildConfig.VERSION_CODE) throw new UpToDate();
        String apkName = value.getString("apkName");
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if (apkName.equals(asset.optString("name")) && asset.optLong("size") == value.getLong("size"))
                return new TvUpdate(value, DOWNLOADS + tag + "/" + apkName);
        }
        return null;
    }
    static void download(TvUpdate update, File destination, AtomicBoolean cancelled, ServerClient.UpdateProgress progress) throws Exception {
        HttpURLConnection request = open(update.apkUrl, "application/octet-stream");
        long start = android.os.SystemClock.elapsedRealtime();
        try {
            if (request.getResponseCode() != 200) throw new Exception("Descarga no disponible.");
            if (!request.getURL().getProtocol().equals("https")) throw new Exception("Origen no permitido.");
            try (InputStream input = request.getInputStream(); FileOutputStream output = new FileOutputStream(destination)) {
                byte[] bytes = new byte[65536]; long total = 0; int count, last = -1;
                while ((count = input.read(bytes)) != -1) {
                    if (cancelled.get() || Thread.currentThread().isInterrupted() || android.os.SystemClock.elapsedRealtime() - start > 300000) throw new Exception("Descarga interrumpida.");
                    total += count; if (total > update.size) throw new Exception("Tamaño de APK inválido.");
                    output.write(bytes, 0, count); int percent = (int) (total * 100 / update.size);
                    if (percent != last) { progress.accept(percent); last = percent; }
                }
                if (total != update.size) throw new Exception("Descarga incompleta.");
                output.getFD().sync();
            }
        } finally { request.disconnect(); }
    }
}
