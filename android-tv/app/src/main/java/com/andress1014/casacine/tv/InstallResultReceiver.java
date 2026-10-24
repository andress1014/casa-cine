package com.andress1014.casacine.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.ResolveInfo;
import android.widget.Toast;

public final class InstallResultReceiver extends BroadcastReceiver {
    static final String ACTION = "com.andress1014.casacine.tv.INSTALL_RESULT";
    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction()) || !intent.hasExtra(PackageInstaller.EXTRA_STATUS)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // This private callback receives a system-generated confirmation Intent only.
            try {
                Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                ResolveInfo resolved = confirmation == null ? null : context.getPackageManager().resolveActivity(confirmation,0);
                if (resolved == null || resolved.activityInfo == null ||
                    (resolved.activityInfo.applicationInfo.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) == 0) throw new Exception();
                confirmation.setComponent(new android.content.ComponentName(resolved.activityInfo.packageName,resolved.activityInfo.name));
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(confirmation);
            } catch (Exception error) { Toast.makeText(context,"No pudimos abrir instalador del TV. Intenta actualizar de nuevo.",Toast.LENGTH_LONG).show(); }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(context,"Guarida actualizada.",Toast.LENGTH_LONG).show();
            try { context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)); }
            catch (Exception ignored) { }
        } else {
            Toast.makeText(context,status == PackageInstaller.STATUS_FAILURE_ABORTED ? "Actualización cancelada." : "No se instaló actualización. Revisa permiso, espacio y versión compatible.",Toast.LENGTH_LONG).show();
        }
    }
}
