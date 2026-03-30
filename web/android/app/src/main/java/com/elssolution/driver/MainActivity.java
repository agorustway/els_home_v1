package com.elssolution.driver;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    private static final int REQ_PERMISSION_CODE = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OverlayPlugin.class);
        registerPlugin(EmergencyPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setNavigationBarColor(android.graphics.Color.BLACK);
        }
        // Capacitor 플러그인이 자체적으로 권한 요청을 처리하므로 네이티브 단의 강제 요청을 제거하여 충돌 방지
    }

    // requestRuntimePermissions 삭제됨 (JS/Capacitor 플러그인에 위임)

    // ─── 뒤로가기 처리 ────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        // JS에 뒤로가기 처리를 먼저 위임
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "(window.handleBackButton && window.handleBackButton()) ? 'CONSUMED' : ((window.isTripActive && window.isTripActive()) ? 'ACTIVE' : 'IDLE')",
                value -> {
                    if (value != null) value = value.replaceAll("^\"|\"$", "");
                    if ("CONSUMED".equals(value)) {
                        // JS에서 뒤로가기 처리를 완료했으므로 다이얼로그를 띄우지 않음
                        return;
                    }
                    boolean isTripActive = "ACTIVE".equals(value);
                    runOnUiThread(() -> showExitDialog(isTripActive));
                }
            );
        } else {
            showExitDialog(false);
        }
    }

    private void showExitDialog(boolean isTripActive) {
        String message = isTripActive
            ? "운행 중에는 앱을 종료할 수 없습니다.\n운행 종료 후 앱 종료가 가능합니다."
            : "앱을 종료하시겠습니까?";

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("ELS 차량관리");
        builder.setMessage(message);

        if (!isTripActive) {
            builder.setPositiveButton("종료", (d, w) -> finishAndRemoveTask());
        }
        builder.setNegativeButton("취소", (d, w) -> d.dismiss());
        builder.show();
    }

    // ─── 배터리 최적화 제외 요청 (JS에서 호출) ────────────────────
    public void requestBatteryOptimizationExclusion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            String packageName = getPackageName();
            if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    // 1순위: 직접 배터리 최적화 제외 요청 (Manifest 권한 필요)
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.fromParts("package", packageName, null));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    // 2순위: 앱 상세 정보창으로 유도 (사용자가 수동으로 '제한 없음' 선택)
                    try {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.fromParts("package", packageName, null));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        runOnUiThread(() -> Toast.makeText(this, "앱 정보 → [배터리] → '제한 없음'을 선택해주세요.", Toast.LENGTH_LONG).show());
                        startActivity(intent);
                    } catch (Exception e2) {
                        // 3순위: 전체 배터리 최적화 설정 화면
                        try {
                            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        } catch (Exception e3) {
                            runOnUiThread(() -> Toast.makeText(this, "배터리 설정 화면을 열 수 없습니다.", Toast.LENGTH_SHORT).show());
                        }
                    }
                }
            } else {
                runOnUiThread(() -> Toast.makeText(this, "배터리 최적화 제외가 이미 설정되어 있습니다.", Toast.LENGTH_SHORT).show());
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // 앱으로 돌아오면 오버레이 숨김
        Intent intent = new Intent(this, FloatingWidgetService.class);
        intent.setAction("SET_VISIBILITY");
        intent.putExtra("visible", false);
        try { startService(intent); } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        // 앱이 백그라운드로 가면 오버레이 표시
        Intent intent = new Intent(this, FloatingWidgetService.class);
        intent.setAction("SET_VISIBILITY");
        intent.putExtra("visible", true);
        try { startService(intent); } catch (Exception ignored) {}
    }
}
