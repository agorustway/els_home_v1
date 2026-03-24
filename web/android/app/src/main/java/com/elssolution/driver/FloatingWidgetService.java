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
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;

public class FloatingWidgetService extends Service {
    private static final String CHANNEL_ID = "DriverStatusChannel";
    private static final String PREFS_NAME = "ELS_DRIVER_PREFS";
    private static final String KEY_TRIP_ID = "LAST_TRIP_ID";
    
    private LocationManager mLocationManager;
    private String mTripId;
    private LocationListener mLocationListener;
    private PowerManager.WakeLock mWakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ELS:GPS_WakeLock");
        mWakeLock.acquire();
        Log.d("DriverApp", "Background Service Created with WakeLock");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        // 1. Trip ID 복구 로직 (메모리 유실 대비)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (intent != null && intent.hasExtra("tripId")) {
            mTripId = intent.getStringExtra("tripId");
            prefs.edit().putString(KEY_TRIP_ID, mTripId).apply();
            Log.d("DriverApp", "New Trip ID set: " + mTripId);
        } else {
            mTripId = prefs.getString(KEY_TRIP_ID, null);
            Log.d("DriverApp", "Recovered Trip ID: " + mTripId);
        }

        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ELS 운송 관리 (실시간)")
                .setContentText(mTripId != null ? "배차 ID: " + mTripId + " 운행중" : "운행 정보를 기록 중입니다.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH) // 우선순위 상향
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, notification);
        }

        if (mTripId != null) {
            startLocationTracking();
        }

        return START_STICKY; // 시스템에 의해 죽어도 다시 살아남
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
                // 노티피케이션 업데이트 (살아있음을 표시)
                updateNotification(location);
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) { Log.d("DriverApp", "Provider Enabled: " + provider); }
            @Override public void onProviderDisabled(String provider) { Log.d("DriverApp", "Provider Disabled: " + provider); }
        };

        try {
            // 더 자주, 더 정확하게 요청 (배터리 사용량 다소 증가하지만 안정성 최우선)
            mLocationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 
                20000, // 20초 (기존 30초에서 단축)
                5,     // 5미터 (기존 10미터에서 단축)
                mLocationListener
            );
            // 네트워크 기반 위치도 보조로 사용 (GPS 음영지역 대비)
            mLocationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER, 
                40000, 
                20, 
                mLocationListener
            );
        } catch (SecurityException e) {
            Log.e("DriverApp", "Location permission denied");
        }
    }

    private void updateNotification(Location loc) {
        String content = String.format("운행 기록 중... (최근: %02d:%02d)", 
            new java.util.Date().getHours(), new java.util.Date().getMinutes());
        
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ELS 운송 관리 (작동중)")
                .setContentText(content)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .build();
        
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(1, notification);
    }

    private void sendLocationToServer(final Location location) {
        if (mTripId == null) return;
        
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL("https://nollae.com/api/vehicle-tracking/locations");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setDoOutput(true);

                    String jsonBody = String.format(
                        "{\"trip_id\":\"%s\", \"lat\":%6f, \"lng\":%6f, \"source\":\"android_bg\"}",
                        mTripId, location.getLatitude(), location.getLongitude()
                    );

                    OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                    writer.write(jsonBody);
                    writer.flush();
                    writer.close();

                    int responseCode = conn.getResponseCode();
                    Log.d("DriverApp", "Server Res: " + responseCode + " (Trip: " + mTripId + ")");
                    conn.disconnect();
                } catch (Exception e) {
                    Log.e("DriverApp", "Server Error: " + e.getMessage());
                }
            }
        }).start();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "ELS Driver Status",
                    NotificationManager.IMPORTANCE_HIGH // 중요도 상향
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mLocationManager != null && mLocationListener != null) {
            mLocationManager.removeUpdates(mLocationListener);
        }
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }
        Log.d("DriverApp", "Background Service Destroyed");
    }
}
