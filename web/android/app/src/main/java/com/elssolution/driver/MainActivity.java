package com.elssolution.driver;

import android.Manifest;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(OverlayPlugin.class);

        // 안드로이드 13 이상에서 알림, 미디어, 전화 권한 요청
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            String[] permissions = {
                Manifest.permission.POST_NOTIFICATIONS,
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_PHONE_STATE
            };
            
            boolean needRequest = false;
            for (String perm : permissions) {
                if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            
            if (needRequest) {
                ActivityCompat.requestPermissions(this, permissions, 101);
            }
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // 운행 중일 때만 PIP 모드 진입 시도 (JS에서 상태 체크 후 호출하는게 베스트지만, 우선 무조건 시도)
        enterPipMode();
    }

    private void enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // PIP 창 가로세로 비율 (1:1 정사각형 추천)
            Rational aspectRatio = new Rational(1, 1);
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(aspectRatio)
                    .build();
            enterPictureInPictureMode(params);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        // PIP 모드 상태 변화를 웹뷰(JS)로 전달
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript("if(window.onPipModeChanged) window.onPipModeChanged(" + isInPictureInPictureMode + ")", null);
        }
    }
}
