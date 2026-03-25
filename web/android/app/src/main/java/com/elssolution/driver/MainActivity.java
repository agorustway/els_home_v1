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
        super.onCreate(savedInstanceState);
        registerPlugin(OverlayPlugin.class);
        registerPlugin(EmergencyPlugin.class);
        requestRuntimePermissions();
    }

    // ─── 권한 요청 ───────────────────────────────────────────────
    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            String[] permissions = {
                Manifest.permission.POST_NOTIFICATIONS,
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.CAMERA
            };
            boolean needRequest = false;
            for (String perm : permissions) {
                if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            if (needRequest) {
                ActivityCompat.requestPermissions(this, permissions, REQ_PERMISSION_CODE);
            }
        }
    }

    // ─── 뒤로가기 처리 ────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        // 운행 중 여부를 JS에서 쿼리
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "(window.isTripActive && window.isTripActive()) ? 'true' : 'false'",
                value -> {
                    boolean isTripActive = "\"true\"".equals(value) || "true".equals(value);
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
                    Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + packageName));
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    runOnUiThread(() -> Toast.makeText(this, "앱 정보창이 열리면 [배터리] > '제한 없음'을 선택해주세요.", Toast.LENGTH_LONG).show());
                    startActivity(fallback);
                } catch (Exception e) {}
            } else {
                runOnUiThread(() -> Toast.makeText(this, "배터리 최적화 제외가 이미 설정되어 있습니다.", Toast.LENGTH_SHORT).show());
            }
        }
    }
}
