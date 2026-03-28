package com.elssolution.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * ELS FloatingWidgetService v4.0
 * - 오버레이 위젯: 운송상태 / 운행시간 / GPS간격 표시 (클릭시 앱 복귀)
 * - 버튼 없음 (순수 표시 + 복귀 전용)
 * - GPS: 속도+자이로 기반 유동적 수신 간격
 * - WakeLock PARTIAL로 화면 꺼짐 시에도 GPS 유지
 */
public class FloatingWidgetService extends Service {

    private static final String TAG = "ELS_SERVICE";
    private static final String CHANNEL_ID = "DriverStatusChannel";
    private static final String PREFS_NAME = "ELS_DRIVER_PREFS";
    private static final String KEY_TRIP_ID = "LAST_TRIP_ID";
    private static final String KEY_START_TIME = "LAST_START_TIME";
    private static final String BASE_URL = "https://www.nollae.com";

    // 오버레이 위젯
    private WindowManager mWindowManager;
    private View mFloatingWidget;
    private WindowManager.LayoutParams mParams;

    // GPS
    private LocationManager mLocationManager;
    private LocationListener mLocationListener;
    private Location mLastLocation;
    private long mLastSendTime = 0;
    private long mCurrentIntervalMs = 60_000; // 기본 60초

    // 자이로스코프
    private SensorManager mSensorManager;
    private SensorEventListener mGyroListener;

    // 타이머
    private Handler mTimerHandler = new Handler(Looper.getMainLooper());
    private Runnable mTimerRunnable;
    private PowerManager.WakeLock mWakeLock;

    // 상태
    private String mTripId;
    private long mStartTimeMillis = 0;
    private String mStatus = "driving"; // driving | paused | completed
    private String mContainerNo = "";
    private int mGpsIntervalSec = 300;
    private String mGpsText = "300초 간격";
    private String mGpsColor = "#7d8590";
    private String mAddress = "위치 확인 중...";

    // 위젯 뷰 참조
    private TextView tvStatus, tvTimer, tvGps, tvAddr;
    private long mLastGpsReceiveTime = 0; // GPS 마지막 수신 시각

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ELS:GPS_WakeLock");
        if (!mWakeLock.isHeld()) mWakeLock.acquire();
        Log.d(TAG, "Service Created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP_SERVICE".equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            if ("UPDATE_STATUS".equals(action)) {
                if (intent.hasExtra("status")) mStatus = intent.getStringExtra("status");
                if (intent.hasExtra("container")) mContainerNo = intent.getStringExtra("container");
                if (intent.hasExtra("gpsText")) mGpsText = intent.getStringExtra("gpsText");
                if (intent.hasExtra("gpsColor")) mGpsColor = intent.getStringExtra("gpsColor");
                if (intent.hasExtra("address")) mAddress = intent.getStringExtra("address");
                updateWidgetDisplay();
                return START_STICKY;
            }
            if ("SET_VISIBILITY".equals(action)) {
                boolean visible = intent.getBooleanExtra("visible", true);
                if (mFloatingWidget != null) {
                    mFloatingWidget.setVisibility(visible ? View.VISIBLE : View.GONE);
                }
                return START_STICKY;
            }

            if (intent.hasExtra("tripId")) mTripId = intent.getStringExtra("tripId");
            if (intent.hasExtra("startTimeMillis")) {
                mStartTimeMillis = intent.getLongExtra("startTimeMillis", System.currentTimeMillis());
            } else if (mStartTimeMillis == 0) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                mStartTimeMillis = prefs.getLong(KEY_START_TIME, System.currentTimeMillis());
            }
            if (intent.hasExtra("container")) mContainerNo = intent.getStringExtra("container");
            if (intent.hasExtra("status")) mStatus = intent.getStringExtra("status");

            SharedPreferences.Editor editor = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit();
            if (mTripId != null) editor.putString(KEY_TRIP_ID, mTripId);
            editor.putLong(KEY_START_TIME, mStartTimeMillis);
            editor.apply();
        }

        createNotificationChannel();
        Notification notification = buildNotification("ELS 운송관리 실행 중");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, notification);
        }

        if (mTripId != null) {
            setupFloatingWidget();
            startLocationTracking();
            startGyroListener();
            startNativeTimer();
        }

        return START_STICKY;
    }

    // ─── 오버레이 위젯 ────────────────────────────────────────────
    private void setupFloatingWidget() {
        if (mFloatingWidget != null) return;

        android.provider.Settings.canDrawOverlays(this);
        if (!android.provider.Settings.canDrawOverlays(this)) {
            Log.w(TAG, "오버레이 권한 없음, 위젯 생략");
            return;
        }

        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        // 위젯 레이아웃 동적 생성 (1.5배 확대 및 디자인 개선)
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#E8111111"));
        root.setPadding(40, 24, 40, 24); // 패딩 증가

        tvStatus = new TextView(this);
        tvStatus.setTextColor(Color.parseColor("#58a6ff"));
        tvStatus.setTextSize(16f); // 11f -> 16f
        tvStatus.setGravity(Gravity.CENTER);

        tvTimer = new TextView(this);
        tvTimer.setTextColor(Color.WHITE);
        tvTimer.setTextSize(30f); // 20f -> 30f
        tvTimer.setTypeface(null, android.graphics.Typeface.BOLD);
        tvTimer.setGravity(Gravity.CENTER);

        tvGps = new TextView(this);
        tvGps.setTextColor(Color.parseColor("#7d8590"));
        tvGps.setTextSize(14f); // 10f -> 14f
        tvGps.setGravity(Gravity.CENTER);

        tvAddr = new TextView(this);
        tvAddr.setTextColor(Color.parseColor("#dddddd"));
        tvAddr.setTextSize(12f);
        tvAddr.setGravity(Gravity.CENTER);
        tvAddr.setSingleLine(true);
        tvAddr.setEllipsize(android.text.TextUtils.TruncateAt.END);

        root.addView(tvStatus);
        root.addView(tvTimer);
        root.addView(tvGps);
        root.addView(tvAddr);

        mFloatingWidget = root;

        int layoutType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        mParams = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        mParams.gravity = Gravity.TOP | Gravity.END; // 우측 상단으로 변경
        mParams.x = 40; // 우측 여백
        mParams.y = 150; // 상단 여백 (상태바/네비게이션바 고려)

        // 드래그 이동 + 클릭 앱 복귀
        mFloatingWidget.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private long touchDownTime;
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = mParams.x; initialY = mParams.y;
                        initialTouchX = event.getRawX(); initialTouchY = event.getRawY();
                        touchDownTime = System.currentTimeMillis();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        mParams.x = initialX - (int)(event.getRawX() - initialTouchX);
                        mParams.y = initialY + (int)(event.getRawY() - initialTouchY);
                        mWindowManager.updateViewLayout(mFloatingWidget, mParams);
                        return true;
                    case MotionEvent.ACTION_UP:
                        float dx = Math.abs(event.getRawX() - initialTouchX);
                        float dy = Math.abs(event.getRawY() - initialTouchY);
                        long duration = System.currentTimeMillis() - touchDownTime;
                        if (dx < 10 && dy < 10 && duration < 300) {
                            // 탭 → 앱 복귀
                            Intent launchIntent = new Intent(getApplicationContext(), MainActivity.class);
                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                            launchIntent.putExtra("goto_tab", "trip");
                            startActivity(launchIntent);
                        }
                        return true;
                }
                return false;
            }
        });

        mFloatingWidget.setVisibility(View.GONE);
        mWindowManager.addView(mFloatingWidget, mParams);
        updateWidgetDisplay();
    }

    private void updateWidgetDisplay() {
        if (tvStatus == null) return;
        String statusLabel = getStatusLabel();
        tvStatus.setText(statusLabel);
        
        tvGps.setText("GPS " + mGpsText);
        try { tvGps.setTextColor(Color.parseColor(mGpsColor)); } catch(Exception e) { tvGps.setTextColor(Color.WHITE); }
        
        if (tvAddr != null) tvAddr.setText(mAddress);
    }

    private String getStatusLabel() {
        switch (mStatus) {
            case "driving": return "운송중";
            case "paused": return "일시정지";
            case "completed": return "운송종료";
            default: return "대기중";
        }
    }

    // ─── 네이티브 타이머 ──────────────────────────────────────────
    private void startNativeTimer() {
        if (mTimerRunnable != null) mTimerHandler.removeCallbacks(mTimerRunnable);
        mTimerRunnable = new Runnable() {
            @Override
            public void run() {
                if (tvTimer == null) { mTimerHandler.postDelayed(this, 1000); return; }
                if ("driving".equals(mStatus)) {
                    long elapsed = System.currentTimeMillis() - mStartTimeMillis;
                    tvTimer.setText(formatTime(elapsed));
                    updateNotification("운행중 " + formatTime(elapsed) + (mContainerNo.isEmpty() ? "" : " | " + mContainerNo));
                } else {
                    tvTimer.setText("일시정지");
                }
                mTimerHandler.postDelayed(this, 1000);
            }
        };
        mTimerHandler.post(mTimerRunnable);
    }

    private String formatTime(long millis) {
        long s = millis / 1000, h = s / 3600, m = (s % 3600) / 60;
        return String.format(Locale.getDefault(), "%02d:%02d:%02d", h, m, s % 60);
    }

    // ─── 유동적 GPS 수신 ──────────────────────────────────────────
    private void startLocationTracking() {
        mLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        mLocationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (!"driving".equals(mStatus)) return;
                
                // 속도 계산 (m/s -> kph)
                float speedKph = location.hasSpeed() ? location.getSpeed() * 3.6f : 0f;
                
                // GPS 수신 타임스탬프 갱신
                mLastGpsReceiveTime = System.currentTimeMillis();
                
                // JS가 1초마다 updateStatus를 보내지만, 네이티브 자체도 GPS 수신 직후 표시 갱신
                // (앱이 포그라운드로 복귀하거나 JS브릿지가 늦는 경우 대비)
                if (mGpsText.isEmpty() || mGpsText.equals("대기중")) {
                    // 속도 기반으로 간이 interval 표시
                    int intervalSec = speedKph >= 60 ? 30 : (speedKph >= 20 ? 45 : 60);
                    mGpsText = intervalSec + "s";
                    mGpsColor = "#10b981"; // 초록 (수신중)
                }
                updateWidgetDisplay();

                long now = System.currentTimeMillis();
                if (now - mLastSendTime >= mCurrentIntervalMs) {
                    mLastLocation = location;
                    mLastSendTime = now;
                    sendLocationToServer(location, speedKph);
                }
            }
            @Override public void onStatusChanged(String p, int s, Bundle b) {}
            @Override public void onProviderEnabled(String p) {}
            @Override public void onProviderDisabled(String p) {}
        };
        try {
            mLocationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 3, mLocationListener);
            mLocationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000, 5, mLocationListener);
        } catch (SecurityException e) {
            Log.e(TAG, "GPS 권한 없음");
        }
    }

    // ─── 자이로스코프 — 급커브 감지 시 즉시 전송 ─────────────────
    private void startGyroListener() {
        mSensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        Sensor gyro = mSensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        if (gyro == null) return;
        mGyroListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                float magnitude = (float) Math.sqrt(
                    event.values[0] * event.values[0] +
                    event.values[1] * event.values[1] +
                    event.values[2] * event.values[2]
                );
                // 급회전(0.8 rad/s 이상) 감지 → 즉시 위치 전송
                if (magnitude > 0.8f && mLastLocation != null && "driving".equals(mStatus)) {
                    long now = System.currentTimeMillis();
                    if (now - mLastSendTime > 10_000) { // 급회전도 10초 쿨다운
                        mLastSendTime = now;
                        sendLocationToServer(mLastLocation, -1);
                    }
                }
            }
            @Override public void onAccuracyChanged(Sensor s, int a) {}
        };
        mSensorManager.registerListener(mGyroListener, gyro, SensorManager.SENSOR_DELAY_NORMAL);
    }

    // ─── 위치 서버 전송 ───────────────────────────────────────────
    private void sendLocationToServer(final Location location, final float speedKph) {
        new Thread(() -> {
            try {
                URL url = new URL(BASE_URL + "/api/vehicle-tracking/location");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                String speedStr = speedKph >= 0 ? String.format(Locale.US, ",\"speed\":%.1f", speedKph) : "";
                String body = String.format(Locale.US,
                    "{\"trip_id\":\"%s\",\"lat\":%f,\"lng\":%f,\"source\":\"android_bg\"%s}",
                    mTripId, location.getLatitude(), location.getLongitude(), speedStr
                );

                OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                writer.write(body); writer.flush(); writer.close();
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "GPS 전송 실패: " + e.getMessage());
            }
        }).start();
    }

    // ─── 알림 ─────────────────────────────────────────────────────
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "ELS 운행상태", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("goto_tab", "trip");
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ELS 운송관리")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(1, buildNotification(text));
    }

    // ─── 운행 종료 마지막 위치 전송 (JS에서 호출) ─────────────────
    public void sendFinalLocation() {
        if (mLastLocation != null) {
            sendLocationToServer(mLastLocation, 0);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mWindowManager != null && mFloatingWidget != null) {
            try { mWindowManager.removeView(mFloatingWidget); } catch (Exception ignored) {}
        }
        if (mLocationManager != null && mLocationListener != null) {
            mLocationManager.removeUpdates(mLocationListener);
        }
        if (mSensorManager != null && mGyroListener != null) {
            mSensorManager.unregisterListener(mGyroListener);
        }
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }
        if (mTimerRunnable != null) mTimerHandler.removeCallbacks(mTimerRunnable);
        Log.d(TAG, "Service Destroyed");
    }
}
