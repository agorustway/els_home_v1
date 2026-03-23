package com.elssolution.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.util.Log;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;

public class FloatingWidgetService extends Service {
    private WindowManager mWindowManager;
    private View mFloatingWidget;
    private static final String CHANNEL_ID = "DriverStatusChannel";
    private LocationManager mLocationManager;
    private String mTripId;
    private LocationListener mLocationListener;

    public FloatingWidgetService() {
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ELS 운송 관리")
                .setContentText("운행 정보를 기록 중입니다.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, notification);
        }

        if (intent != null) {
            String tripId = intent.getStringExtra("tripId");
            if (tripId != null) {
                mTripId = tripId;
                startLocationTracking();
            }
            if (intent.hasExtra("timer")) {
                updateWidget(
                    intent.getStringExtra("timer"),
                    intent.getStringExtra("container"),
                    intent.getStringExtra("status")
                );
            }
        }
        return START_STICKY;
    }

    private void startLocationTracking() {
        if (mLocationManager == null) {
            mLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        }
        
        if (mLocationListener != null) return;

        mLocationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                sendLocationToServer(location);
                Log.d("DriverApp", "Location changed: " + location.getLatitude() + "," + location.getLongitude());
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };

        try {
            mLocationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 
                30000, // 30초마다
                10,     // 10미터 이동 시
                mLocationListener
            );
        } catch (SecurityException e) {
            Log.e("DriverApp", "Location permission denied");
        }
    }

    private void sendLocationToServer(final Location location) {
        if (mTripId == null) return;
        
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // 서버 API 엔드포인트에 직접 POST
                    URL url = new URL("https://nollae.com/api/vehicle-tracking/locations");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);

                    String jsonBody = String.format(
                        "{\"trip_id\":\"%s\", \"lat\":%f, \"lng\":%f, \"source\":\"android\"}",
                        mTripId, location.getLatitude(), location.getLongitude()
                    );

                    OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                    writer.write(jsonBody);
                    writer.flush();
                    writer.close();

                    int responseCode = conn.getResponseCode();
                    Log.d("DriverApp", "Location sent. Response: " + responseCode);
                    conn.disconnect();
                } catch (Exception e) {
                    Log.e("DriverApp", "Failed to send location: " + e.getMessage());
                }
            }
        }).start();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "ELS Driver Status",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // [삭제] 오버레이 위젯 UI 관련 코드 제거 (APK 최적화)
        Log.d("DriverApp", "Background Service Created (Foreground Service mode)");
    }

    private void updateWidget(String timer, String container, String status) {
        // [삭제] 위젯 업데이트 미사용
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mLocationManager != null && mLocationListener != null) {
            mLocationManager.removeUpdates(mLocationListener);
        }
        Log.d("DriverApp", "Background Service Destroyed");
    }
}
