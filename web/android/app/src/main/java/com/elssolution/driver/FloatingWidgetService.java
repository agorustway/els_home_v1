package com.elssolution.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
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
        PendingIntent pendingIntent = PendingIntent.getActivity(this,
                0, notificationIntent, PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("실시간 운송 추적 중")
                .setContentText("위치 정보를 서버로 전송하고 있습니다.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();

        startForeground(1, notification);

        if (intent != null) {
            String tripId = intent.getStringExtra("tripId");
            if (tripId != null) {
                mTripId = tripId;
                startLocationTracking();
            }
            if (intent.hasExtra("timer")) {
                updateWidget(intent.getStringExtra("timer"), intent.getStringExtra("container"));
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
                    URL url = new URL("https://els-home-v1.vercel.app/api/vehicle-tracking/locations");
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
        mFloatingWidget = LayoutInflater.from(this).inflate(R.layout.layout_floating_widget, null);

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.x = 100;
        params.y = 100;

        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        mWindowManager.addView(mFloatingWidget, params);

        mFloatingWidget.findViewById(R.id.root_container).setOnTouchListener(new View.OnTouchListener() {
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
                    case MotionEvent.ACTION_UP:
                        // 앱으로 복귀하는 로직 추가 가능
                        if (Math.abs(event.getRawX() - initialTouchX) < 10 && Math.abs(event.getRawY() - initialTouchY) < 10) {
                            Intent i = new Intent(FloatingWidgetService.this, MainActivity.class);
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                            startActivity(i);
                        }
                        return true;
                }
                return false;
            }
        });
    }

    private void updateWidget(String timer, String container) {
        if (mFloatingWidget != null) {
            TextView txtTimer = mFloatingWidget.findViewById(R.id.floating_timer);
            TextView txtContainer = mFloatingWidget.findViewById(R.id.floating_container);
            if (txtTimer != null) txtTimer.setText(timer);
            if (txtContainer != null) txtContainer.setText(container);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mFloatingWidget != null) mWindowManager.removeView(mFloatingWidget);
    }
}
