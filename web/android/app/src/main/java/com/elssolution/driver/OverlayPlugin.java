package com.elssolution.driver;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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

        // Step 1: 직접 오버레이 설정 화면
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "[ELS차량용]을 찾아 '허용'으로 설정해 주세요", Toast.LENGTH_LONG).show());
            }
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception e) {
            // Step 2: 앱 정보 화면 (제한된 설정 없을 때)
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "우측 상단 ⋮ 메뉴 > '제한된 설정 허용' 후 지정해 주세요", Toast.LENGTH_LONG).show());
                }
                getContext().startActivity(fallback);
                call.resolve(new JSObject().put("opened", true).put("restrictedSettings", true));
            } catch (Exception e2) {
                call.reject("권한 설정 화면을 열 수 없습니다: " + e2.getMessage());
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

    // JS → 배터리 최적화 제외 요청
    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).requestBatteryOptimizationExclusion();
        }
        call.resolve(new JSObject().put("requested", true));
    }
}
