package com.andress1014.casacine.tv;

import org.json.JSONObject;
import android.os.Build;

final class TvUpdate {
    final int versionCode;
    final String versionName, sha256;
    final long size;
    TvUpdate(JSONObject value) throws Exception {
        versionCode = value.getInt("versionCode"); versionName = value.getString("versionName");
        sha256 = value.getString("sha256"); size = value.getLong("size");
        int minSdk = value.getInt("minSdk");
        if (!BuildConfig.APPLICATION_ID.equals(value.getString("packageName")) || versionCode <= BuildConfig.VERSION_CODE
            || !versionName.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || versionName.length() > 40
            || !sha256.matches("[a-f0-9]{64}") || size < 1024 || size > 128L * 1024 * 1024
            || minSdk < 23 || minSdk > Build.VERSION.SDK_INT
            || !value.getString("apkName").equals("Guarida-TV-v" + versionName + ".apk")
            || !value.getString("downloadPath").equals("/api/tv/update/apk/" + sha256)) {
            throw new Exception("Actualización incompatible con este TV.");
        }
    }
}
