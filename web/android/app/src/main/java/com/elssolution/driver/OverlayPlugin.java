package com.elssolution.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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

    private BroadcastReceiver widgetActionReceiver;

    @Override
    public void load() {
        super.load();
        widgetActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.elssolution.driver.WIDGET_ACTION".equals(intent.getAction())) {
                    String action = intent.getStringExtra("action");
                    JSObject ret = new JSObject();
                    ret.put("action", action);
                    notifyListeners("onWidgetAction", ret);
                }
            }
        };
        // 안드로이드 14 지원을 위한 Exported 속성 (RECEIVER_NOT_EXPORTED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().registerReceiver(widgetActionReceiver, new IntentFilter("com.elssolution.driver.WIDGET_ACTION"), Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(widgetActionReceiver, new IntentFilter("com.elssolution.driver.WIDGET_ACTION"));
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (widgetActionReceiver != null) {
            try {
                getContext().unregisterReceiver(widgetActionReceiver);
            } catch (Exception e) {}
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            granted = Settings.canDrawOverlays(getContext());
        }
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            } catch (Exception e) {
                // Settings activity not found (e.g. on Android TV or custom ROMs)
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
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
        String status = call.getString("status", "driving");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateOverlay(PluginCall call) {
        String timer = call.getString("timer");
        String container = call.getString("container");
        String status = call.getString("status");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        getContext().startService(intent); // Already running, will call onStartCommand
        call.resolve();
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingWidgetService.class));
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            getActivity().startActivity(intent);
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Settings.ACTION_SETTINGS);
                getActivity().startActivity(intent);
            } catch (Exception e2) {}
        }
        call.resolve();
    }
}
