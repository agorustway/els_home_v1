package com.elssolution.driver;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    private static final String TAG = "OverlayPlugin";

    /**
     * 오버레이 권한 상태 확인
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ret.put("granted", Settings.canDrawOverlays(getContext()));
        } else {
            ret.put("granted", true); // M 미만은 자동 허용
        }
        call.resolve(ret);
    }

    /**
     * 오버레이 권한 설정 화면 열기 (핵심 변경!)
     * startActivityForResult로 열고, 사용자가 돌아오면 결과를 JS로 리턴
     */
    @PluginMethod
    public void requestPermission(final PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            getActivity().runOnUiThread(() -> {
                try {
                    // 안드로이드 16 등 최신 OS에서 정확한 앱 설정 창을 열기 위해 package URI 명시
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getActivity().getPackageName())
                    );
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivityForResult(call, intent, "overlayPermResult");
                    Log.d(TAG, "오버레이 권한 설정 화면 열기 시도 (패키지 지정)");
                } catch (Exception e) {
                    Log.w(TAG, "패키지 지정 설정 창 열기 실패, 일반 목록 시도: " + e.getMessage());
                    try {
                        Intent intentList = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                        intentList.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivityForResult(call, intentList, "overlayPermResult");
                    } catch (Exception e2) {
                        call.reject("설정 화면을 열 수 없습니다.");
                    }
                }
            });
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        }
    }

    /**
     * 사용자가 설정 화면에서 돌아왔을 때 호출되는 콜백
     */
    @ActivityCallback
    public void overlayPermResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        
        boolean granted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            granted = Settings.canDrawOverlays(getContext());
        } else {
            granted = true;
        }

        Log.d(TAG, "오버레이 권한 확인 콜백 결과: " + granted);
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    /**
     * 플로팅 위젯 표시
     */
    @PluginMethod
    public void showOverlay(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            call.reject("오버레이 권한이 없습니다. 설정에서 허용해 주세요.");
            return;
        }
        String timer = call.getString("timer", "00:00:00");
        String container = call.getString("container", "-");
        String status = call.getString("status", "driving");
        String tripId = call.getString("tripId");

        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", timer);
        intent.putExtra("container", container);
        intent.putExtra("status", status);
        intent.putExtra("tripId", tripId);
        getContext().startService(intent);
        Log.d(TAG, "플로팅 위젯 시작");
        call.resolve();
    }

    /**
     * 플로팅 위젯 업데이트
     */
    @PluginMethod
    public void updateOverlay(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingWidgetService.class);
        intent.putExtra("timer", call.getString("timer"));
        intent.putExtra("container", call.getString("container"));
        intent.putExtra("status", call.getString("status"));
        intent.putExtra("tripId", call.getString("tripId"));
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * 플로팅 위젯 숨기기
     */
    @PluginMethod
    public void hideOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingWidgetService.class));
        call.resolve();
    }

    /**
     * 앱 설정 화면 열기
     */
    @PluginMethod
    public void openAppSettings(final PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * 위치 설정 화면 열기
     */
    @PluginMethod
    public void openLocationSettings(final PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * 앱을 포그라운드로 가져오기
     */
    @PluginMethod
    public void bringToFront(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            Intent intent = new Intent(activity, activity.getClass());
            intent.setFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        }
        call.resolve();
    }
}
