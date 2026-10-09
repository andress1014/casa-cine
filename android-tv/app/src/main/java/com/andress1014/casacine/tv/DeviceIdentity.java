package com.andress1014.casacine.tv;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;

public final class DeviceIdentity {
    private DeviceIdentity() {}
    public static String deviceName(Context context) {
        String name = null;
        try { name = Settings.Global.getString(context.getContentResolver(), "device_name"); }
        catch (SecurityException ignored) { }
        return clean(name == null || name.trim().isEmpty() ? Build.MODEL : name);
    }
    public static String clean(String name) {
        String value = name == null ? "" : name.replaceAll("[\\x00-\\x1f]", "").trim();
        return value.substring(0, Math.min(60, value.length()));
    }
}
