package com.elssolution.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
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
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class FloatingWidgetService extends Service {
    private static final String TAG = "ELS_SERVICE";
    private static final String CHANNEL_ID = "DriverStatusChannel";
    private static final String PREFS_NAME = "ELS_DRIVER_PREFS";
    private static final String KEY_TRIP_ID = "LAST_TRIP_ID";
    private static final String KEY_START_TIME = "LAST_START_TIME";

    private WindowManager mWindowManager;
    private View mFloatingWidget;
    private WindowManager.LayoutParams params;
    
    private LocationManager mLocationManager;
    private LocationListener mLocationListener;
    private PowerManager.WakeLock mWakeLock;
    
    private String mTripId;
    private long mStartTimeMillis = 0;
    private String mContainerInfo = "📦 주행 중";
    private String mStatus = "driving";

    private Handler mTimerHandler = new Handler(Looper.getMainLooper());
    private Runnable mTimerRunnable;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ELS:GPS_WakeLock");
        mWakeLock.acquire();
        Log.d(TAG, "Foreground Service Created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP_SERVICE".equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            }

            // 파라미터 수신
            if (intent.hasExtra("tripId")) mTripId = intent.getStringExtra("tripId");
            if (intent.hasExtra("startTimeMillis")) {
                mStartTimeMillis = intent.getLongExtra("startTimeMillis", System.currentTimeMillis());
            } else if (mStartTimeMillis == 0) {
                // 저장된 시간 복구 시도
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                mStartTimeMillis = prefs.getLong(KEY_START_TIME, System.currentTimeMillis());
            }
            
            if (intent.hasExtra("container")) mContainerInfo = intent.getStringExtra("container");
            if (intent.hasExtra("status")) mStatus = intent.getStringExtra("status");

            // 상태 저장 (앱 재시작 대비)
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            if (mTripId != null) editor.putString(KEY_TRIP_ID, mTripId);
            editor.putLong(KEY_START_TIME, mStartTimeMillis);
            editor.apply();
        }

        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, buildNotification("운행 정보를 확인 중입니다..."), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, buildNotification("운행 정보를 확인 중입니다..."));
        }

        if (mTripId != null) {
            startLocationTracking();
            setupFloatingWidget();
            startNativeTimer();
        }

        return START_STICKY;
    }

    private void startNativeTimer() {
        if (mTimerRunnable != null) mTimerHandler.removeCallbacks(mTimerRunnable);
        
        mTimerRunnable = new Runnable() {
            @Override
            public void run() {
                if (!"driving".equals(mStatus)) {
                    updateUI("PAUSED", mContainerInfo);
                } else {
                    long elapsed = System.currentTimeMillis() - mStartTimeMillis;
                    String timeStr = formatElapsedTime(elapsed);
                    updateUI(timeStr, mContainerInfo);
                    updateNotification("운행 중: " + timeStr + " (" + mContainerInfo + ")");
                }
                mTimerHandler.postDelayed(this, 1000);
            }
        };
        mTimerHandler.post(mTimerRunnable);
    }

    private String formatElapsedTime(long millis) {
        long seconds = millis / 1000;
        long h = seconds / 3600;
        long m = (seconds % 3600) / 60;
        long s = seconds % 60;
        return String.format(Locale.getDefault(), "%02d:%02d:%02d", h, m, s);
    }

    private void setupFloatingWidget() {
        if (mFloatingWidget != null) return;

        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        mFloatingWidget = LayoutInflater.from(this).inflate(R.layout.layout_floating_widget, null);

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 100;
        params.y = 200;

        // 드래그 이동 구현
        mFloatingWidget.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        mWindowManager.updateViewLayout(mFloatingWidget, params);
                        return true;
                }
                return false;
            }
        });

        // 버튼 클릭 처리
        Button btnPause = mFloatingWidget.findViewById(R.id.btn_pause_resume);
        Button btnStop = mFloatingWidget.findViewById(R.id.btn_stop);

        btnPause.setOnClickListener(v -> togglePause());
        btnStop.setOnClickListener(v -> confirmStop());

        mWindowManager.addView(mFloatingWidget, params);
    }

    private void togglePause() {
        final String nextStatus = "driving".equals(mStatus) ? "paused" : "driving";
        final String action = "driving".equals(mStatus) ? "pause" : "resume";

        new Thread(() -> {
            if (updateStatusWithActionToServer(action)) {
                mStatus = nextStatus;
                mTimerHandler.post(() -> {
                    Button btnPause = mFloatingWidget.findViewById(R.id.btn_pause_resume);
                    btnPause.setText("paused".equals(mStatus) ? "재개" : "일시정지");
                    updateNotification("운행 " + ("paused".equals(mStatus) ? "일시정지" : "중"));
                });
            }
        }).start();
    }

    private boolean updateStatusWithActionToServer(String action) {
        try {
            URL url = new URL("https://nollae.com/api/vehicle-tracking/trips/" + mTripId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            String body = "{\"action\":\"" + action + "\"}";
            OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
            writer.write(body);
            writer.flush();
            writer.close();

            int code = conn.getResponseCode();
            conn.disconnect();
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void confirmStop() {
        // 운행 종료 API 백그라운드 호출
        new Thread(() -> {
            if (updateStatusToServer("finished")) {
                mTimerHandler.post(() -> {
                    stopSelf();
                    // 메인 앱 깨우기 시도 (선택사항)
                });
            }
        }).start();
    }

    private void updateUI(String timer, String container) {
        if (mFloatingWidget == null) return;
        TextView tvTimer = mFloatingWidget.findViewById(R.id.tv_timer);
        TextView tvContainer = mFloatingWidget.findViewById(R.id.tv_container);
        tvTimer.setText(timer);
        tvContainer.setText(container);
    }

    private void startLocationTracking() {
        if (mLocationManager == null) {
            mLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        }
        if (mLocationListener != null) return;

        mLocationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if ("driving".equals(mStatus)) {
                    sendLocationToServer(location);
                }
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };

        try {
            // 더 자주, 더 정밀하게 (20초 -> 15초, 5미터)
            mLocationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000, 5, mLocationListener);
            mLocationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30000, 10, mLocationListener);
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error");
        }
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(1, buildNotification(text));
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ELS 운송 관리")
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build();
    }

    private boolean updateStatusToServer(String newStatus) {
        try {
            URL url = new URL("https://nollae.com/api/vehicle-tracking/trips/" + mTripId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            String body = "{\"status\":\"" + newStatus + "\"}";
            OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
            writer.write(body);
            writer.flush();
            writer.close();

            int code = conn.getResponseCode();
            conn.disconnect();
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void sendLocationToServer(final Location location) {
        new Thread(() -> {
            try {
                URL url = new URL("https://nollae.com/api/vehicle-tracking/locations");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                String jsonBody = String.format(Locale.US,
                    "{\"trip_id\":\"%s\", \"lat\":%6f, \"lng\":%6f, \"source\":\"android_bg\"}",
                    mTripId, location.getLatitude(), location.getLongitude()
                );

                OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                writer.write(jsonBody);
                writer.flush();
                writer.close();
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "GPS Send Error: " + e.getMessage());
            }
        }).start();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID, "ELS Driver Status", NotificationManager.IMPORTANCE_HIGH);
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mWindowManager != null && mFloatingWidget != null) {
            mWindowManager.removeView(mFloatingWidget);
        }
        if (mLocationManager != null && mLocationListener != null) {
            mLocationManager.removeUpdates(mLocationListener);
        }
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }
        mTimerHandler.removeCallbacks(mTimerRunnable);
    }
}
