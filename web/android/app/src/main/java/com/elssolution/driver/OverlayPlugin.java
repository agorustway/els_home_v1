package com.elssolution.driver;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.getcapacitor.PermissionCallback;

@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void showOverlay(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            call.reject("Permission denied");
            return;
        }

        String timer = call.getString("timer", "00:00:00");
        String container = call.getString("container", "📦 미입력");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateOverlay(PluginCall call) {
        String timer = call.getString("timer");
        String container = call.getString("container");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        getContext().startService(intent); // Already running, will call onStartCommand
        call.resolve();
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingWidgetService.class));
        call.resolve();
    }
}
