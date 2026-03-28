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

/**
 * OverlayPlugin v3.0
 * Android 16 (API 36) Sideloaded APK 대응
 * 3단계 권한 유도 전략:
 *   1) canDrawOverlays() 체크
 *   2) ACTION_MANAGE_OVERLAY_PERMISSION 직접 오픈
 *   3) 실패 시 ACTION_APPLICATION_DETAILS_SETTINGS → Toast 안내
 */
@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    private static final int REQ_OVERLAY = 2001;

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
        if (Settings.canDrawOverlays(getContext())) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        // 무조건 앱 정보 화면으로 이동 (제한된 설정 허용 및 권한 통합 관리 유도)
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
        String tripId = call.getString("tripId", "");
        String container = call.getString("container", "");
        String status = call.getString("status", "driving");
        long startTime = call.getLong("startTimeMillis", System.currentTimeMillis());

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("tripId", tripId);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        intent.putExtra("startTimeMillis", startTime);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve(new JSObject().put("started", true));
    }

    // JS → 서비스 상태 업데이트
    @PluginMethod
    public void updateStatus(PluginCall call) {
        String status = call.getString("status", "driving");
        String container = call.getString("container", "");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.setAction("UPDATE_STATUS");
        intent.putExtra("status", status);
        intent.putExtra("container", container);
        getContext().startService(intent);
        call.resolve(new JSObject().put("updated", true));
    }

    // JS → 서비스 종료
    @PluginMethod
    public void stopService(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.setAction("STOP_SERVICE");
        getContext().startService(intent);
        call.resolve(new JSObject().put("stopped", true));
    }

    // JS → 배터리 최적화 제외 요청 (Android 16 정밀 대응)
    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        Log.d("ELS_DEBUG", "Battery optimization request started");
        
        try {
            Context context = getContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            String packageName = context.getPackageName();
            
            if (pm != null && pm.isIgnoringBatteryOptimizations(packageName)) {
                Log.d("ELS_DEBUG", "Battery optimization already ignored");
                getActivity().runOnUiThread(() -> Toast.makeText(context, "배터리 최적화 제외가 이미 설정되어 있습니다.", Toast.LENGTH_SHORT).show());
                call.resolve(new JSObject().put("granted", true));
                return;
            }

            Log.d("ELS_DEBUG", "Attempting ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with Uri.fromParts");
            try {
                // 1순위: 직접 요청 (안드로이드 16 최적화 규격)
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.fromParts("package", packageName, null));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                Log.d("ELS_DEBUG", "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS success");
            } catch (ActivityNotFoundException | SecurityException e) {
                Log.e("ELS_DEBUG", "Direct request failed, falling back to general list", e);
                // 2순위: 사용자 직접 리스트 선택 (폴백)
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                
                getActivity().runOnUiThread(() -> Toast.makeText(context, "배터리 -> [제한 없음]으로 설정해주세요.", Toast.LENGTH_LONG).show());
                Log.d("ELS_DEBUG", "ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS fallback sent");
            }
            call.resolve(new JSObject().put("requested", true));
            
        } catch (Exception e) {
            Log.e("ELS_DEBUG", "Critical error in requestBatteryOptimization", e);
            e.printStackTrace();
            call.reject("배터리 설정 시도 중 오류: " + e.getMessage());
        }
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
