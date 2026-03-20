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

@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(getContext())) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivityForResult(intent, 5469);
                call.resolve();
            } else {
                call.resolve(new JSObject().put("granted", true));
            }
        } else {
            call.resolve(new JSObject().put("granted", true));
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
