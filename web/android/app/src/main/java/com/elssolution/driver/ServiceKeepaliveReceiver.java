package com.elssolution.driver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * ELS ServiceKeepaliveReceiver v4.2.51
 *
 * AlarmManager(setExactAndAllowWhileIdle)로 주기적으로 호출되어
 * FloatingWidgetService가 죽었을 때 즉시 재시작하는 "심장박동(Heartbeat)" 수신자.
 *
 * Doze 모드에서도 setExactAndAllowWhileIdle은 보장됨 (Android 공식 문서 확인).
 * Samsung One UI가 Service를 죽여도 알람이 서비스를 깨워 재시작.
 */
public class ServiceKeepaliveReceiver extends BroadcastReceiver {

    private static final String TAG = "ELS_KEEPALIVE";
    static final String ACTION_KEEPALIVE = "com.elssolution.driver.KEEPALIVE_PING";
    static final String ACTION_BOOT = "android.intent.action.BOOT_COMPLETED";

    // 핑 간격: 90초 (1분 30초) — Doze 허용 범위 내 최단 간격
    private static final long PING_INTERVAL_MS = 90_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        Log.d(TAG, "[PING] onReceive: " + action);

        if (ACTION_KEEPALIVE.equals(action)) {
            // 서비스가 살아있는지 확인 — 죽었으면 재시작
            if (!isServiceRunning(context)) {
                Log.w(TAG, "[PING] 서비스 죽음 감지 → 재시작");
                restartService(context);
            } else {
                Log.d(TAG, "[PING] 서비스 정상 생존 확인");
            }
            // 다음 핑 예약 (연쇄 반복)
            scheduleNextPing(context);

        } else if (ACTION_BOOT.equals(action)) {
            // 기기 재부팅 후 자동 시작 (운전 중 기기 재시작 대비)
            Log.d(TAG, "[BOOT] 기기 재부팅 감지 → Keepalive 예약 시작");
            scheduleNextPing(context);
        }
    }

    /**
     * FloatingWidgetService가 현재 실행 중인지 확인
     * Android 8+에서는 getRunningServices()가 제한되므로 SharedPreferences로 대체
     */
    private boolean isServiceRunning(Context context) {
        android.content.SharedPreferences prefs =
            context.getSharedPreferences("ELS_DRIVER_PREFS", Context.MODE_PRIVATE);
        long lastHeartbeat = prefs.getLong("SERVICE_HEARTBEAT", 0);
        // 서비스가 살아있으면 5초마다 heartbeat를 기록함
        // 마지막 heartbeat로부터 30초 이상 지났으면 죽은 것으로 판단
        return System.currentTimeMillis() - lastHeartbeat < 30_000;
    }

    /**
     * FloatingWidgetService 재시작
     */
    private void restartService(Context context) {
        try {
            android.content.SharedPreferences prefs =
                context.getSharedPreferences("ELS_DRIVER_PREFS", Context.MODE_PRIVATE);
            String tripId = prefs.getString("LAST_TRIP_ID", null);
            // tripId가 없으면 운행 중이 아니므로 재시작 불필요
            if (tripId == null || tripId.isEmpty()) {
                Log.d(TAG, "[PING] tripId 없음 (운행 중 아님) → 재시작 생략");
                return;
            }
            Intent serviceIntent = new Intent(context, FloatingWidgetService.class);
            serviceIntent.putExtra("keepalive_restart", true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.d(TAG, "[PING] 서비스 재시작 명령 전송 완료");
        } catch (Exception e) {
            Log.e(TAG, "[PING] 재시작 실패: " + e.getMessage());
        }
    }

    /**
     * 다음 Keepalive 알람 예약
     * setExactAndAllowWhileIdle → Doze 모드에서도 정확히 실행됨
     */
    static void scheduleNextPing(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, ServiceKeepaliveReceiver.class);
        intent.setAction(ACTION_KEEPALIVE);
        PendingIntent pi = PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long triggerAt = System.currentTimeMillis() + PING_INTERVAL_MS;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // setExactAndAllowWhileIdle: Doze 모드 관통 — 가장 강한 알람
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
            Log.d(TAG, "[PING] 다음 핑 예약: " + PING_INTERVAL_MS / 1000 + "초 후");
        } catch (Exception e) {
            Log.e(TAG, "[PING] 알람 예약 실패: " + e.getMessage());
        }
    }

    /**
     * 알람 취소 (운행 종료 시 호출)
     */
    static void cancelPing(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, ServiceKeepaliveReceiver.class);
        intent.setAction(ACTION_KEEPALIVE);
        PendingIntent pi = PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        am.cancel(pi);
        Log.d(TAG, "[PING] Keepalive 알람 취소 완료");
    }
}
