package com.andress1014.casacine.tv;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class Media {
    public String id, title, description, category, status, addedBy;
    public double duration;
    public int progress;
    public long posterVersion;
    public boolean hasPoster;
    public final List<Subtitle> subtitles = new ArrayList<>();
    public static final class Subtitle {
        public String id,language,label;
        public boolean forced;
    }
    public static Media fromJson(JSONObject value) {
        Media media = new Media(); media.id = value.optString("id"); ServerClient.validateId(media.id);
        media.title = value.optString("title", "Video"); media.description = value.optString("description");
        media.category = value.optString("category", "Otros"); media.status = value.optString("status");
        media.addedBy = value.optString("addedBy", "Alguien de casa");
        media.duration = value.optDouble("duration", 0); media.progress = value.optInt("progress", 0);
        media.posterVersion = Math.max(0,value.optLong("posterVersion",0));
        media.hasPoster = value.has("posterUrl") && !value.isNull("posterUrl");
        JSONArray tracks = value.optJSONArray("subtitles");
        if (tracks != null) for (int i=0;i<Math.min(tracks.length(),24);i++) {
            JSONObject track = tracks.optJSONObject(i); if (track == null) continue;
            try {
                Subtitle subtitle = new Subtitle(); subtitle.id = track.optString("id"); ServerClient.validateId(subtitle.id);
                subtitle.language = track.optString("language","und"); if (!subtitle.language.matches("[a-z]{2,3}(-[a-zA-Z]{2})?")) subtitle.language = "und";
                subtitle.label = track.optString("label","Subtítulos").replaceAll("[\\x00-\\x1f]",""); if (subtitle.label.length() > 80) subtitle.label = subtitle.label.substring(0,80);
                subtitle.forced = track.optBoolean("forced"); media.subtitles.add(subtitle);
            } catch (IllegalArgumentException ignored) { }
        }
        return media;
    }
    public String length() {
        int minutes = (int) Math.round(duration / 60);
        if (duration < 60) return String.format(Locale.ROOT, "%d s", (int)Math.ceil(duration));
        return minutes >= 60 ? (minutes / 60) + " h " + (minutes % 60) + " min" : minutes + " min";
    }
}
