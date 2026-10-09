package com.andress1014.casacine.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.view.InputDevice;
import java.util.ArrayList;
import java.util.List;

public final class Controllers {
    private Controllers() {}
    public static boolean isController(InputDevice device) {
        return device != null && (device.supportsSource(InputDevice.SOURCE_GAMEPAD) || device.supportsSource(InputDevice.SOURCE_JOYSTICK));
    }
    public static List<InputDevice> connected() {
        List<InputDevice> devices = new ArrayList<>();
        for (int id : InputDevice.getDeviceIds()) { InputDevice device = InputDevice.getDevice(id); if (isController(device)) devices.add(device); }
        return devices;
    }
    public static String status() {
        List<InputDevice> devices = connected(); if (devices.isEmpty()) return "Conecta mando PS5 por Bluetooth o USB";
        return devices.size() + (devices.size() == 1 ? " mando · " : " mandos · ") + devices.get(0).getName();
    }
    public static void help(Activity activity) {
        help(activity,null);
    }
    public static void help(Activity activity,Runnable dismissed) {
        StringBuilder text = new StringBuilder("Android " + Build.VERSION.RELEASE + "\n\n");
        for (InputDevice device : connected()) text.append("Conectado: ").append(device.getName()).append('\n');
        text.append("\nBluetooth: con mando apagado, mantén Crear + PS hasta que luz parpadee. En ajustes de TV, añade Wireless Controller.\n\nUSB: conecta cable USB-C de datos entre mando y TV.\n\nMenús: cruceta/stick para moverte, ✕ para aceptar, ○ para volver. Dentro de juego, mantén Options para abrir menú de partida.\n\nSony indica soporte DualSense desde Android TV 12. En versiones anteriores depende de fabricante. Emparejamiento se realiza en TV.");
        new AlertDialog.Builder(activity).setTitle("Tu mando PS5").setMessage(text.toString()).setNegativeButton("Cerrar",(d,w) -> {})
            .setPositiveButton("Ajustes Bluetooth",(d,w) -> {
                try { activity.startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); }
                catch (Exception unavailable) { try { activity.startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) {} }
            }).setOnDismissListener(d -> { if (dismissed != null) dismissed.run(); }).show();
    }
}
