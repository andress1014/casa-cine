package com.andress1014.casacine.tv;
import org.json.JSONObject;
import java.util.Locale;

public final class Media {
    public String id, title, description, category, status, addedBy;
    public double duration;
    public int progress;
    public boolean hasPoster;
    public static Media fromJson(JSONObject value) {
        Media media = new Media(); media.id = value.optString("id"); ServerClient.validateId(media.id);
        media.title = value.optString("title", "Video"); media.description = value.optString("description");
        media.category = value.optString("category", "Otros"); media.status = value.optString("status");
        media.addedBy = value.optString("addedBy", "Alguien de casa");
        media.duration = value.optDouble("duration", 0); media.progress = value.optInt("progress", 0);
        media.hasPoster = !value.isNull("posterUrl"); return media;
    }
    public String length() {
        int minutes = (int) Math.round(duration / 60);
        if (duration < 60) return String.format(Locale.ROOT, "%d s", (int)Math.ceil(duration));
        return minutes >= 60 ? (minutes / 60) + " h " + (minutes % 60) + " min" : minutes + " min";
    }
}
