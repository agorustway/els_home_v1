package com.elssolution.driver;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * OverlayPlugin v3.0
 * Android 16 (API 36) Sideloaded APK 대응
 * 3단계 권한 유도 전략:
 *   1) canDrawOverlays() 체크
 *   1) 무조건 ACTION_APPLICATION_DETAILS_SETTINGS 오픈
 *   2) 실패 시 ACTION_SETTINGS → Toast 안내
 */
@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    private static final int REQ_OVERLAY = 2001;
    private static final String PREFS_NAME = "ELS_DRIVER_PREFS";
    private static final String KEY_TRIP_ID = "LAST_TRIP_ID";
    private static final String KEY_START_TIME = "LAST_START_TIME";

    private void clearNativeTripState(Context context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_TRIP_ID)
            .remove(KEY_START_TIME)
            .remove("SERVICE_HEARTBEAT")
            .apply();
        ServiceKeepaliveReceiver.cancelPing(context);
    }

    private boolean hasNativeTrip(Context context) {
        String tripId = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_TRIP_ID, "");
        return tripId != null && !tripId.trim().isEmpty();
    }

    // JS → 오버레이 권한 확인
    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = Settings.canDrawOverlays(getContext());
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    // JS → 오버레이 권한 설정 화면 열기 (Android 16 3단계)
    @PluginMethod
    public void requestPermission(PluginCall call) {
        /* 
         * [거부 회피 전략] 
         * 권한 상태와 무관하게 사용자가 버튼을 눌렀을 때 무조건 앱 정보 화면으로 이동.
         */

        try {
            String packageName = getContext().getPackageName();
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", packageName, null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "[다른 앱 위에 표시] 및 [배터리] 설정 확인", Toast.LENGTH_LONG).show());
            }
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true).put("restrictedSettings", true));
        } catch (Exception e2) {
            // 2차 폴백: 일반 설정창
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve(new JSObject().put("opened", true).put("fallback", true));
            } catch (Exception e3) {
                call.reject("권한 설정 화면을 열 수 없습니다.");
            }
        }
    }

    // JS → 서비스 시작 (운행 시작 시)
    @PluginMethod
    public void startService(PluginCall call) {
        Context context = getContext();
        String tripId = call.getString("tripId", "");
        String container = call.getString("container", "");
        String status = call.getString("status", "driving");
        String driverId = call.getString("driverId", "");
        long startTime = call.getLong("startTimeMillis", System.currentTimeMillis());
        Boolean visible = call.getBoolean("visible");

        try {
            if (tripId != null && !tripId.trim().isEmpty()) {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_TRIP_ID, tripId)
                    .putLong(KEY_START_TIME, startTime)
                    .apply();
            }

            Intent intent = new Intent(context, FloatingWidgetService.class);
            intent.putExtra("tripId", tripId);
            intent.putExtra("container", container);
            intent.putExtra("status", status);
            intent.putExtra("driverId", driverId);
            intent.putExtra("startTimeMillis", startTime);
            intent.putExtra("visible", visible != null && visible);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            call.resolve(new JSObject().put("started", true));
        } catch (Exception e) {
            clearNativeTripState(context);
            sendRemoteLog("startService failed: " + e.getMessage(), "SERVICE_ERR");
            call.reject("오버레이 서비스 시작 실패: " + e.getMessage());
        }
    }

    // JS → 오버레이 위젯 표시/숨김 제어
    @PluginMethod
    public void setWidgetVisible(PluginCall call) {
        boolean visible = call.getBoolean("visible", true);
        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.setAction("SET_VISIBILITY");
        intent.putExtra("visible", visible);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve(new JSObject().put("visible", visible));
        } catch (Exception e) {
            call.resolve(new JSObject().put("visible", false).put("error", e.getMessage()));
        }
    }

    // JS → 서비스 상태 업데이트
    @PluginMethod
    public void updateStatus(PluginCall call) {
        Context context = getContext();
        if (!hasNativeTrip(context)) {
            call.resolve(new JSObject().put("updated", false).put("reason", "no_active_trip"));
            return;
        }

        String status = call.getString("status", "driving");
        String container = call.getString("container", "");
        String gpsText = call.getString("gpsText", "");
        String gpsColor = call.getString("gpsColor", "");
        String address = call.getString("address", "");

        Intent intent = new Intent(context, FloatingWidgetService.class);
        intent.setAction("UPDATE_STATUS");
        intent.putExtra("status", status);
        intent.putExtra("container", container);
        if (!gpsText.isEmpty()) intent.putExtra("gpsText", gpsText);
        if (!gpsColor.isEmpty()) intent.putExtra("gpsColor", gpsColor);
        if (!address.isEmpty()) intent.putExtra("address", address);
        
        Boolean isRealtime = call.getBoolean("isRealtime");
        if (isRealtime != null) {
            intent.putExtra("isRealtime", isRealtime);
        }
        
        try {
            context.startService(intent);
            call.resolve(new JSObject().put("updated", true));
        } catch (Exception e) {
            sendRemoteLog("updateStatus failed: " + e.getMessage(), "SERVICE_ERR");
            call.resolve(new JSObject().put("updated", false).put("error", e.getMessage()));
        }
    }

    // JS → 서비스 종료
    @PluginMethod
    public void stopService(PluginCall call) {
        Context context = getContext();
        clearNativeTripState(context);
        try {
            context.stopService(new Intent(context, FloatingWidgetService.class));
            call.resolve(new JSObject().put("stopped", true));
        } catch (Exception e) {
            sendRemoteLog("stopService failed: " + e.getMessage(), "SERVICE_ERR");
            call.resolve(new JSObject().put("stopped", false).put("error", e.getMessage()));
        }
    }

    // JS → 앱 종료 (Samsung crash dialog 방지를 위해 process kill 금지)
    @PluginMethod
    public void exitAppForce(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            .edit().putString("EXPLICIT_EXIT", "true").apply();
        clearNativeTripState(context);
        try {
            context.stopService(new Intent(context, FloatingWidgetService.class));
        } catch (Exception ignored) {}
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                getActivity().moveTaskToBack(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    try { getActivity().finishAndRemoveTask(); } catch (Exception ignored) {}
                } else {
                    getActivity().finishAffinity();
                }
            });
        }
        call.resolve(new JSObject().put("exited", true));
    }

    // JS → 배터리 최적화 제외 요청 (Android 16 정밀 대응)
    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        String logMsg = "Battery optimization request started";
        Log.d("ELS_DEBUG", logMsg);
        sendRemoteLog(logMsg, "BATTERY");
        
        try {
            Context context = getContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            String packageName = context.getPackageName();
            
            /* 
             * [거부 회피 전략]
             * 배터리 최적화 확인 로직을 스킵하고 무조건 요청 액티비티를 트리거함.
             */

            sendRemoteLog("Attempting ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with Uri.fromParts", "BATTERY");
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.fromParts("package", packageName, null));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                sendRemoteLog("ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS success", "BATTERY");
            } catch (ActivityNotFoundException | SecurityException e) {
                sendRemoteLog("Direct request failed: " + e.getMessage(), "BATTERY_ERROR");
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                
                getActivity().runOnUiThread(() -> Toast.makeText(context, "배터리 -> [제한 없음]으로 설정해주세요.", Toast.LENGTH_LONG).show());
                sendRemoteLog("ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS fallback sent", "BATTERY");
            }
            call.resolve(new JSObject().put("requested", true));
            
        } catch (Exception e) {
            sendRemoteLog("Critical error: " + e.getMessage(), "BATTERY_CRASH");
            e.printStackTrace();
            call.reject("배터리 설정 시도 중 오류: " + e.getMessage());
        }
    }

    private void sendRemoteLog(String msg, String tag) {
        new Thread(() -> {
            try {
                URL url = new URL("https://www.elssolution.com/api/debug/log");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                
                JSObject json = new JSObject();
                json.put("msg", msg);
                json.put("tag", "NATIVE_" + tag);
                json.put("device", android.os.Build.MODEL);
                
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode(); 
                conn.disconnect();
            } catch (Exception e) {
                Log.e("ELS_DEBUG_REMOTE", "Log send fail", e);
            }
        }).start();
    }

    // JS → 배터리 최적화 여부 확인
    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        Log.d("ELS_DEBUG", "checkBatteryOptimization call");
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean isIgnoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            Log.d("ELS_DEBUG", "isIgnoringBatteryOptimizations: " + isIgnoring);
            call.resolve(new JSObject().put("granted", isIgnoring));
        } catch (Exception e) {
            Log.e("ELS_DEBUG", "checkBatteryOptimization error", e);
            call.resolve(new JSObject().put("granted", false));
        }
    }
}
