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
    public void requestPermission(final PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            if (getActivity() != null) {
                getActivity().runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean success = false;
                        try {
                            // 1단계: 패키지명 포함하여 다이렉트 호출
                            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:" + getContext().getPackageName()));
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_HISTORY);
                            getActivity().startActivity(intent);
                            success = true;
                        } catch (Exception e) {
                            try {
                                // 2단계: 실패 시 전체 오버레이 설정 목록 호출
                                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                getActivity().startActivity(intent);
                                success = true;
                            } catch (Exception e2) {
                                // 3단계: 애플리케이션 정보 페이지 (수동 설정 유도)
                                try {
                                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                                    intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    getActivity().startActivity(intent);
                                    success = true;
                                } catch (Exception e3) {}
                            }
                        }
                        call.resolve();
                    }
                });
            } else {
                call.resolve();
            }
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
        String tripId = call.getString("tripId");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        intent.putExtra("tripId", tripId);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateOverlay(PluginCall call) {
        String timer = call.getString("timer");
        String container = call.getString("container");
        String status = call.getString("status");
        String tripId = call.getString("tripId");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        intent.putExtra("tripId", tripId);
        getContext().startService(intent); // Already running, will call onStartCommand
        call.resolve();
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingWidgetService.class));
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(final PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(intent);
                    } catch (Exception e) {
                        try {
                            Intent intent2 = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            intent2.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                            intent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            getActivity().startActivity(intent2);
                        } catch (Exception e2) {}
                    }
                    call.resolve();
                }
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void openLocationSettings(final PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(intent);
                    } catch (Exception e) {
                        try {
                            Intent intent2 = new Intent(Settings.ACTION_SETTINGS);
                            intent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            getActivity().startActivity(intent2);
                        } catch (Exception e2) {}
                    }
                    call.resolve();
                }
            });
        } else {
            call.resolve();
        }
    }
}
