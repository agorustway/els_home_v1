package com.elssolution.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * EmergencyPlugin v1.0
 * 긴급알림 수신 시 네이티브 고우선순위 알림 발송
 * - 알림음 + 진동
 * - 안드로이드 알림 트레이에 영구 표시 (사용자가 스와이프로 직접 삭제)
 */
@CapacitorPlugin(name = "Emergency")
public class EmergencyPlugin extends Plugin {

    private static final String CHANNEL_ID = "ELS_EMERGENCY";
    private static final int NOTIFICATION_BASE_ID = 9000;

    @PluginMethod
    public void showEmergencyAlert(PluginCall call) {
        String message = call.getString("message", "긴급 안내가 있습니다.");
        String title = call.getString("title", "⚠️ ELS 긴급알림");
        int notifId = call.getInt("id", NOTIFICATION_BASE_ID);

        createEmergencyChannel();

        Intent launchIntent = new Intent(getContext(), MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("goto_tab", "notice");
        PendingIntent pendingIntent = PendingIntent.getActivity(
            getContext(), notifId, launchIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new androidx.core.app.NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setAutoCancel(false) // 사용자가 직접 지워야 함
            .setOngoing(false)    // 스와이프로 삭제 가능
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
            .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)
            .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle().bigText(message))
            .build();

        NotificationManager nm = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        nm.notify(notifId, notification);

        // 진동
        triggerVibration();

        call.resolve(new JSObject().put("shown", true));
    }

    private void createEmergencyChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "ELS 긴급알림", NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription("운전원용 긴급 안내 알림");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            nm.createNotificationChannel(ch);
        }
    }

    private void triggerVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getContext().getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    vm.getDefaultVibrator().vibrate(VibrationEffect.createWaveform(
                        new long[]{0, 500, 200, 500, 200, 500}, -1
                    ));
                }
            } else {
                Vibrator v = (Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
                if (v != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 500, 200, 500, 200, 500}, -1));
                    } else {
                        v.vibrate(new long[]{0, 500, 200, 500, 200, 500}, -1);
                    }
                }
            }
        } catch (Exception ignored) {}
    }
}
