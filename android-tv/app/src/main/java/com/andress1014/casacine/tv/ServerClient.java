package com.andress1014.casacine.tv;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.net.URLEncoder;
import java.text.Normalizer;
import java.util.Locale;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class ServerClient {
    public static final class AccessRequired extends Exception {}
    private static volatile String sessionServer = "";
    private static volatile String sessionCookie = "";
    public final String base;
    public ServerClient(String address) { base = ServerAddress.normalize(address); }
    public String cookie() { return base.equals(sessionServer) ? sessionCookie : ""; }
    public String streamUrl(String id) {
        validateId(id); return base + "/api/media/" + id + "/stream";
    }
    public static void validateId(String id) {
        if (id == null || !id.matches("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"))
            throw new IllegalArgumentException("Video inválido.");
    }
    private HttpURLConnection connection(String endpoint) throws Exception {
        HttpURLConnection request = (HttpURLConnection) new URL(base + endpoint).openConnection();
        request.setInstanceFollowRedirects(false);
        request.setConnectTimeout(7000); request.setReadTimeout(15000);
        if (!cookie().isEmpty()) request.setRequestProperty("Cookie", cookie());
        return request;
    }
    private static byte[] read(InputStream stream, int max) throws Exception {
        try (InputStream source = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = source.read(buffer)) != -1) {
                if (output.size() + count > max) throw new Exception("Respuesta demasiado grande.");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }
    private JSONObject json(String endpoint, JSONObject body) throws Exception {
        HttpURLConnection request = connection(endpoint);
        try {
            request.setRequestProperty("Accept", "application/json");
            if (body != null) {
                request.setRequestMethod("POST"); request.setDoOutput(true);
                request.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                request.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream stream = request.getOutputStream()) { stream.write(bytes); }
            }
            int status = request.getResponseCode();
            if (status == 401) throw new AccessRequired();
            if (status < 200 || status >= 300) throw new Exception(status == 429 ? "Espera un minuto antes de volver a intentar." : "No pudimos conectar con Palomita.");
            String received = request.getHeaderField("Set-Cookie");
            if (received != null) {
                String cookie = received.split(";", 2)[0];
                if (cookie.matches("casacine=[0-9]{13}\\.[a-f0-9]{32}\\.[a-f0-9]{64}")) {
                    sessionServer = base; sessionCookie = cookie;
                }
            }
            return new JSONObject(new String(read(request.getInputStream(), 12 * 1024 * 1024), StandardCharsets.UTF_8));
        } finally { request.disconnect(); }
    }
    public boolean authenticated() throws Exception { return json("/api/session", null).optBoolean("authenticated"); }
    public void login(String code) throws Exception {
        if (code == null || code.length() > 128) throw new IllegalArgumentException("Código inválido.");
        json("/api/session", new JSONObject().put("code", code));
    }
    public List<Media> library() throws Exception {
        JSONArray values = json("/api/media", null).getJSONArray("media");
        List<Media> result = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) {
            try { result.add(Media.fromJson(values.getJSONObject(i))); }
            catch (IllegalArgumentException ignored) { /* Ignore entries that cannot safely be addressed. */ }
        }
        return result;
    }
    public Media media(String id) throws Exception { validateId(id); return Media.fromJson(json("/api/media/" + id,null).getJSONObject("media")); }
    public String subtitleUrl(String mediaId,String trackId) { validateId(mediaId); validateId(trackId); return base + "/api/media/" + mediaId + "/subtitles/" + trackId; }
    public Bitmap poster(String id) throws Exception {
        validateId(id);
        HttpURLConnection request = connection("/api/media/" + id + "/poster");
        return bitmap(request,720);
    }
    private Bitmap bitmap(HttpURLConnection request,int width) throws Exception {
        try {
            if (request.getResponseCode() != 200) return null;
            byte[] image = read(request.getInputStream(), 2 * 1024 * 1024);
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(image, 0, image.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 4096 || bounds.outHeight > 4096) return null;
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
            while (bounds.outWidth / options.inSampleSize > width) options.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(image, 0, image.length, options);
        } finally { request.disconnect(); }
    }
    public Bitmap artwork(Media media) {
        if (media.hasBackdrop) {
            try { Bitmap image = bitmap(connection("/api/media/" + media.id + "/backdrop"),1280); if (image != null) return image; }
            catch (Exception ignored) { }
        }
        if (media.hasPoster && !"frame".equals(media.posterSource)) {
            try { Bitmap image = poster(media.id); if (image != null) return image; }
            catch (Exception ignored) { }
        }
        // Personal APK contains read-only key at build time. Home videos keep local artwork.
        if (!BuildConfig.TMDB_API_KEY.isEmpty() && ("Películas".equals(media.category) || "Series".equals(media.category))) {
            Bitmap image = tmdbArtwork(media); if (image != null) return image;
        }
        if (media.hasPoster) { try { return poster(media.id); } catch (Exception ignored) { } }
        return null;
    }
    private Bitmap tmdbArtwork(Media media) {
        try {
            JSONObject detail;
            if (media.tmdbId > 0) detail = tmdb(media.tmdbType + "/" + media.tmdbId,"");
            else {
                String query = media.title.replaceAll("[._]"," ").replaceAll("\\b(?:19|20)[0-9]{2}\\b.*$","")
                    .replaceAll("(?i)\\b(?:2160p|1080p|720p|480p|bluray|brrip|webrip|web dl|h264|h265|x264|x265)\\b.*$","").trim();
                if (query.isEmpty()) return null;
                boolean series = "Series".equals(media.category);
                JSONArray results = tmdb("search/" + (series ? "tv" : "movie"),"&include_adult=false&query=" + URLEncoder.encode(query,"UTF-8")).optJSONArray("results");
                if (results == null) return null; detail = null; int matches = 0;
                for (int i=0;i<Math.min(results.length(),20);i++) {
                    JSONObject result = results.optJSONObject(i); if (result == null) continue;
                    if (normalized(query).equals(normalized(result.optString(series ? "name" : "title"))) || normalized(query).equals(normalized(result.optString(series ? "original_name" : "original_title")))) { matches++; detail = result; }
                }
                if (matches != 1 || detail == null) return null;
            }
            String image = detail.optString("backdrop_path","");
            boolean backdrop = image.matches("/[a-zA-Z0-9]+\\.jpg");
            if (!image.matches("/[a-zA-Z0-9]+\\.jpg")) image = detail.optString("poster_path","");
            if (!image.matches("/[a-zA-Z0-9]+\\.jpg")) return null;
            HttpURLConnection request = (HttpURLConnection)new URL("https://image.tmdb.org/t/p/" + (backdrop ? "w1280" : "w500") + image).openConnection();
            request.setConnectTimeout(7000); request.setReadTimeout(12000); request.setInstanceFollowRedirects(false);
            return bitmap(request,1280);
        } catch (Exception ignored) { return null; }
    }
    private static String normalized(String value) {
        return Normalizer.normalize(value,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+"," ").trim();
    }
    private JSONObject tmdb(String endpoint,String query) throws Exception {
        HttpURLConnection request = (HttpURLConnection)new URL("https://api.themoviedb.org/3/" + endpoint + "?language=es-ES&api_key=" + BuildConfig.TMDB_API_KEY + query).openConnection();
        request.setInstanceFollowRedirects(false); request.setConnectTimeout(7000); request.setReadTimeout(12000); request.setRequestProperty("Accept","application/json");
        try {
            if (request.getResponseCode() != 200) throw new Exception("TMDb no disponible.");
            return new JSONObject(new String(read(request.getInputStream(),2*1024*1024),StandardCharsets.UTF_8));
        } finally { request.disconnect(); }
    }
    public static List<String> discover() {
        Set<String> found = new LinkedHashSet<>();
        byte[] message = "CASACINE_DISCOVER_V1".getBytes(StandardCharsets.UTF_8);
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true); socket.setSoTimeout(350);
            Set<InetAddress> broadcasts = new LinkedHashSet<>(); broadcasts.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InterfaceAddress address : network.getInterfaceAddresses()) {
                    if (address.getBroadcast() != null && ServerAddress.isPrivate(address.getAddress().getHostAddress())) broadcasts.add(address.getBroadcast());
                }
            }
            for (InetAddress address : broadcasts) socket.send(new DatagramPacket(message, message.length, address, 3211));
            long end = System.nanoTime() + 2_000_000_000L;
            while (System.nanoTime() < end) {
                DatagramPacket packet = new DatagramPacket(new byte[512], 512);
                try {
                    socket.receive(packet);
                    if (!ServerAddress.isPrivate(packet.getAddress().getHostAddress())) continue;
                    JSONObject response = new JSONObject(new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8));
                    int port = response.optInt("port", 0);
                    if ("CasaCine".equals(response.optString("app")) && response.optInt("version") == 1 && port > 0 && port < 65536) {
                        found.add(ServerAddress.normalize(packet.getAddress().getHostAddress() + ":" + port));
                    }
                } catch (java.net.SocketTimeoutException ignored) { }
            }
        } catch (Exception ignored) { /* Manual connection remains available when broadcasts are blocked. */ }
        return new ArrayList<>(found);
    }
}
