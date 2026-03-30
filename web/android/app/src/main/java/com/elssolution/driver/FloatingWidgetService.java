package com.elssolution.driver;

import android.app.AlarmManager;
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
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
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
import org.json.JSONObject;

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
    private FusedLocationProviderClient mFusedLocationClient;
    private LocationCallback mLocationCallback;
    private Location mLastLocation;
    private long mLastSendTime = 0;
    private long mCurrentIntervalMs = 60_000; // 기본 60초

    // 자이로스코프
    private SensorManager mSensorManager;
    private SensorEventListener mGyroListener;
    private float mLastGyroMagnitude = 0f;

    // 타이머
    private Handler mTimerHandler = new Handler(Looper.getMainLooper());
    private Runnable mTimerRunnable;
    private PowerManager.WakeLock mWakeLock;

    // [v4.2.50] 네트워크 전용 HandlerThread (화면 꺼짐 시 new Thread() 대신 안정적 Worker)
    private android.os.HandlerThread mNetworkThread;
    private Handler mNetworkHandler;

    // 상태
    private String mTripId;
    private long mStartTimeMillis = 0;
    private long mPausedAt = 0; // 일시정지 시작 시각
    private long mTotalPausedMs = 0; // 누적 일시정지 시간
    private String mStatus = "driving"; // driving | paused | completed
    private String mContainerNo = "";
    private String mGpsText = "대기중";
    private String mGpsColor = "#7d8590";
    private String mAddress = "위치 확인 중...";
    private boolean mIsRealtimeMode = false; // 실시간 3초 모드

    // [v4.2.48] GPS 상태 watchdog (JS 의존 없이 네이티브 자체 판단)
    private static final long GPS_DEAD_THRESHOLD_MS = 15_000;
    private static final long GPS_CHECK_INTERVAL_MS = 2_000;
    private long mLastGpsCheckTime = 0;

    // [v4.2.50] 네이티브 역지오코딩 주기 (30초마다 한 번)
    private static final long GEOCODE_INTERVAL_MS = 30_000;
    private long mLastGeocodeTime = 0;

    // 위젯 뷰 참조
    private TextView tvStatus, tvTimer, tvGps, tvAddr;
    private long mLastGpsReceiveTime = 0;
    private long mLastCommandPollTime = 0;
    private long mLastNativeLogTime = 0; // CCTV 주기 로깅 쿨타임

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();

        // [v4.2.50] WakeLock 먼저 — ON_AFTER_RELEASE로 마지막 POST 완충
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        mWakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ON_AFTER_RELEASE,
            "ELS:GPS_WakeLock"
        );
        if (!mWakeLock.isHeld()) mWakeLock.acquire(12 * 60 * 60 * 1000L); // 12시간 timeout

        // [v4.2.50] HandlerThread 초기화 — 화면 꺼짐 시 네트워크 안정적 유지
        mNetworkThread = new android.os.HandlerThread("ELS_NetworkWorker");
        mNetworkThread.start();
        mNetworkHandler = new Handler(mNetworkThread.getLooper());

        // [v4.2.50] onCreate에서 즉시 startForeground — Samsung은 5초 초과 시 ANR 처리
        createNotificationChannel();
        Notification notification = buildNotification("ELS 운송관리 실행 중");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34+
            startForeground(1, notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION |
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(1, notification);
        }

        Log.d(TAG, "Service Created — Foreground 즉시 선언 완료");

        // [v4.2.51] Doze 관통 Keepalive 알람 시작
        // setExactAndAllowWhileIdle 사용 — Doze 모드에서도 90초마다 피드백 보장
        ServiceKeepaliveReceiver.scheduleNextPing(this);
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
                String newStatus = intent.getStringExtra("status");
                // 일시정지 상태 변화 감지 및 시간 계산
                if ("paused".equals(newStatus) && !"paused".equals(mStatus)) {
                    mPausedAt = System.currentTimeMillis();
                } else if ("driving".equals(newStatus) && "paused".equals(mStatus)) {
                    if (mPausedAt > 0) {
                        mTotalPausedMs += (System.currentTimeMillis() - mPausedAt);
                        mPausedAt = 0;
                    }
                }

                if (intent.hasExtra("status")) mStatus = newStatus;
                if (intent.hasExtra("container")) mContainerNo = intent.getStringExtra("container");
                // [v4.2.48] JS에서 gpsText/Color가 올 때만 덮어씀 (네이티브 자체 판단 보호)
                // JS 포그라운드 실행 중 = 최신 상태 유지, 백그라운드 시 = 네이티브 자체 판단
                if (intent.hasExtra("gpsText")) {
                    String newGpsText = intent.getStringExtra("gpsText");
                    // JS에서 "연결안됨"을 보낸 경우는 네이티브 자체 판단과 일치하므로 허용
                    // JS에서 정상 상태를 보내는 경우 lastGpsReceiveTime도 갱신 (오탐 방지)
                    if (newGpsText != null && !newGpsText.equals("연결안됨")) {
                        mLastGpsReceiveTime = System.currentTimeMillis(); // JS가 살아있으면 GPS 수신 중으로 간주
                    }
                    mGpsText = newGpsText;
                }
                if (intent.hasExtra("gpsColor")) mGpsColor = intent.getStringExtra("gpsColor");
                if (intent.hasExtra("address")) mAddress = intent.getStringExtra("address");

                // [v4.2.48] 실시간 모드 동기화: JS가 실시간 상태 알려주면 GPS 주기도 맞춤
                if (intent.hasExtra("isRealtime")) {
                    boolean newRealtime = intent.getBooleanExtra("isRealtime", false);
                    if (newRealtime != mIsRealtimeMode) {
                        mIsRealtimeMode = newRealtime;
                        mCurrentIntervalMs = mIsRealtimeMode ? 3_000L : 60_000L;
                        // GPS 수신 주기 재설정
                        restartLocationTracking();
                        Log.d(TAG, "[SYNC] Realtime mode: " + mIsRealtimeMode + " -> interval: " + mCurrentIntervalMs + "ms");
                    }
                }
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

            if (intent.hasExtra("tripId")) {
                Object obj = intent.getExtras().get("tripId");
                mTripId = String.valueOf(obj);
            }
            if (intent.hasExtra("startTimeMillis")) {
                mStartTimeMillis = intent.getLongExtra("startTimeMillis", System.currentTimeMillis());
                mTotalPausedMs = 0; // 새로 시작 시 초기화
                mPausedAt = 0;
            } else if (mStartTimeMillis == 0) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                mStartTimeMillis = prefs.getLong(KEY_START_TIME, System.currentTimeMillis());
            }
            if (intent.hasExtra("container")) mContainerNo = intent.getStringExtra("container");
            if (intent.hasExtra("status")) {
                String newStatus = intent.getStringExtra("status");
                if ("paused".equals(newStatus)) mPausedAt = System.currentTimeMillis();
                mStatus = newStatus;
            }

            SharedPreferences.Editor editor = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit();
            if (mTripId != null) editor.putString(KEY_TRIP_ID, mTripId);
            editor.putLong(KEY_START_TIME, mStartTimeMillis);
            editor.apply();
        }

        // [v4.2.50] startForeground는 onCreate()에서 이미 호출됨 — 여기서 중복 호출 불필요
        // 알림 텍스트만 갱신
        updateNotification("ELS 운송관리 실행 중");

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
            case "driving": return "운행중";
            case "paused": return "일시정지";
            case "completed": return "운행종료";
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

                long now = System.currentTimeMillis();
                long elapsed;

                // [v4.2.51] Heartbeat 갱신 — ServiceKeepaliveReceiver가 생존 판단에 사용
                // 매 1초 타이머마다 갱신: 30초 이상 없으면 Receiver가 서비스 재시작
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit().putLong("SERVICE_HEARTBEAT", now).apply();
                
                // [v4.2.56] CPU 생존 체크 CCTV (60초 주기 틱)
                if (now - mLastNativeLogTime >= 60000) {
                    mLastNativeLogTime = now;
                    sendNativeWebLog("NATIVE_CPU", "네이티브 60초 틱 생존!");
                }
                
                if ("driving".equals(mStatus)) {
                    elapsed = now - mStartTimeMillis - mTotalPausedMs;
                    tvTimer.setText(formatTime(elapsed));
                    updateNotification("운행중 " + formatTime(elapsed) + (mContainerNo.isEmpty() ? "" : " | " + mContainerNo));

                    // [v4.2.48] 5초마다 GPS 상태 체크 (엘리베이터/터널/음영지역 즉각 감지)
                    if (now - mLastGpsCheckTime >= GPS_CHECK_INTERVAL_MS) {
                        mLastGpsCheckTime = now;
                        // 실시간 모드에서는 15초, 일반 모드에서는 30초를 dead 기준으로 사용
                        long deadThreshold = mIsRealtimeMode ? 15_000L : GPS_DEAD_THRESHOLD_MS;
                        if (mLastGpsReceiveTime > 0 && now - mLastGpsReceiveTime > deadThreshold) {
                            // GPS 미수신: 즉시 빨간색 표시
                            mGpsText = "연결안됨";
                            mGpsColor = "#ef4444";
                            updateWidgetDisplay();
                            Log.d(TAG, "[GPS_DEAD] 미수신 " + ((now - mLastGpsReceiveTime) / 1000) + "s → 빨간색");
                        }
                    }

                    // [v4.2.48] 네이티브 자체 명령 폴링 (JS가 백그라운드에서 죽어있을 때 대비)
                    if (now - mLastCommandPollTime > 30_000) {
                        mLastCommandPollTime = now;
                        pollSystemCommand();
                    }
                } else if ("paused".equals(mStatus)) {
                    // 일시정지 시에는 멈춘 시점의 시간 표시
                    long currentPausedMs = (mPausedAt > 0) ? (now - mPausedAt) : 0;
                    elapsed = now - mStartTimeMillis - mTotalPausedMs - currentPausedMs;
                    tvTimer.setText(formatTime(elapsed));
                    updateNotification("일시정지 " + formatTime(elapsed));
                } else {
                    tvTimer.setText("대기중");
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

    // ─── 유동적 GPS 수신 (FusedLocation + LocationCallback) ──────────────
    private void startLocationTracking() {
        mFusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        
        if (mLocationCallback == null) {
            mLocationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    if (locationResult == null) return;
                    for (Location loc : locationResult.getLocations()) {
                        handleLocation(loc);
                    }
                }
            };
        }
        
        applyLocationTracking();
    }
    
    // onLocationChanged 대체: FusedLocation 결과 처리부
    private void handleLocation(Location location) {
        if (!"driving".equals(mStatus)) return;
        
        float speedKph = location.hasSpeed() ? location.getSpeed() * 3.6f : 0f;
        mLastGpsReceiveTime = System.currentTimeMillis();
        
        // [v4.2.56] GPS 수신 완료 CCTV 전송
        sendNativeWebLog("NATIVE_GPS", "백그라운드 GPS 수신: " + location.getLatitude() + "," + location.getLongitude());
        
        if (mIsRealtimeMode) {
            mGpsText = "실시간 수집중";
            mGpsColor = "#f59e0b";
        } else {
            if (speedKph >= 60) mGpsText = "30s 고속";
            else if (speedKph >= 20) mGpsText = "45s 주행";
            else mGpsText = "60s 저속";
            mGpsColor = "#10b981";
        }
        
        // [v4.2.54] 백그라운드 워커 스레드(mNetworkThread)에서 UI 스레드 안전 호출
        new Handler(Looper.getMainLooper()).post(this::updateWidgetDisplay);

        long now = System.currentTimeMillis();
        if (now - mLastSendTime >= mCurrentIntervalMs) {
            mLastLocation = location;
            mLastSendTime = now;
            sendLocationToServer(location, speedKph);
        }

        if (now - mLastGeocodeTime >= GEOCODE_INTERVAL_MS) {
            mLastGeocodeTime = now;
            final double lat = location.getLatitude();
            final double lng = location.getLongitude();
            mNetworkHandler.post(() -> geocodeAndUpdateOverlay(lat, lng));
        }
    }

    /**
     * [v4.2.48] LocationManager 요청 주기를 현재 mCurrentIntervalMs에 맞춰 재설정
     * 실시간 모드 전환 시 GPS 수신 주기를 3초로 즉시 변경하기 위해 분리
     */
    /**
     * [v4.2.52] LocationRequest 최적화 (Doze/네트워크 뚫기)
     */
    private void applyLocationTracking() {
        if (mFusedLocationClient == null || mLocationCallback == null) return;
        try {
            mFusedLocationClient.removeLocationUpdates(mLocationCallback);
            
            // [v4.2.55] 배칭(Batching) 완전 제거 - 배터리 소모 무시하고 무지성 즉각 수신 강제
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, mCurrentIntervalMs)
                    .setMinUpdateIntervalMillis(mCurrentIntervalMs) // 지연 절대 금지, 동일 간격 강제
                    .setWaitForAccurateLocation(false)
                    .build();
                    
            // Intent Firewall 우회를 위해 Callback + Looper 직접 바인딩 사용
            mFusedLocationClient.requestLocationUpdates(request, mLocationCallback, mNetworkThread.getLooper());
            Log.d(TAG, "[GPS] FusedLocationProviderClient (우선순위 강제 수신) 등록 완료, Interval: " + mCurrentIntervalMs);
        } catch (SecurityException e) {
            Log.e(TAG, "GPS 권한 없음");
        }
    }

    /**
     * [v4.2.48] 실시간 모드 전환 시 LocationTracking 재시작
     */
    private void restartLocationTracking() {
        new Handler(Looper.getMainLooper()).post(this::applyLocationTracking);
    }

    // ─── 자이로스코프 — 급커브 감지 시 즉시 전송 ─────────────────
    private void startGyroListener() {
        mSensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        Sensor gyro = mSensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        if (gyro == null) {
            Log.w(TAG, "자이로스코프 센서 없음 - 가속도계로 대체");
            // 자이로 없으면 가속도계(TYPE_ACCELEROMETER)로 대체
            Sensor accel = mSensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accel == null) return;
            mGyroListener = new SensorEventListener() {
                @Override
                public void onSensorChanged(SensorEvent event) {
                    // 중력 제거 후 순수 가속도 크기 계산
                    float ax = event.values[0], ay = event.values[1], az = event.values[2];
                    float magnitude = (float) Math.sqrt(ax*ax + ay*ay + az*az);
                    mLastGyroMagnitude = Math.max(magnitude - 9.8f, 0); // 중력(9.8) 제거
                    // 급가속/감속(3 m/s² 이상) 감지 → 즉시 위치 전송
                    if (mLastGyroMagnitude > 3.0f && mLastLocation != null && "driving".equals(mStatus)) {
                        long now = System.currentTimeMillis();
                        if (now - mLastSendTime > 10_000) {
                            mLastSendTime = now;
                            sendLocationToServer(mLastLocation, -1);
                        }
                    }
                }
                @Override public void onAccuracyChanged(Sensor s, int a) {}
            };
            mSensorManager.registerListener(mGyroListener, accel, SensorManager.SENSOR_DELAY_NORMAL);
            return;
        }
        mGyroListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                // 3축 각속도 크기 (rad/s)
                mLastGyroMagnitude = (float) Math.sqrt(
                    event.values[0] * event.values[0] +
                    event.values[1] * event.values[1] +
                    event.values[2] * event.values[2]
                );
                // [v4.2.48] 급회전(1.0 rad/s 이상) 감지 → 즉시 이벤트 마킹 전송
                if (mLastGyroMagnitude > 1.0f && mLastLocation != null && "driving".equals(mStatus)) {
                    long now = System.currentTimeMillis();
                    if (now - mLastSendTime > 10_000) { // 10초 쿨다운
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
        // [v4.2.50] HandlerThread 사용 — GPS 콜백마다 new Thread() 생성 제거
        mNetworkHandler.post(() -> sendLocationToServerWithMarker(location, speedKph, null));
    }

    /**
     * [v4.2.48] 이벤트 마커 포함 전송
     * @param markerType null=일반, TRIP_START, TRIP_END, TRIP_PAUSE, TRIP_RESUME, GPS_TURN
     */
    private void sendLocationToServerWithMarker(final Location location, final float speedKph, final String markerType) {
        // HandlerThread(mNetworkHandler)에서 호출되므로 new Thread 불필요 — 직접 실행
        Runnable task = () -> {
            try {
                URL url = new URL(BASE_URL + "/api/vehicle-tracking/location");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                JSONObject jsonBody = new JSONObject();
                jsonBody.put("trip_id", mTripId != null ? mTripId : "");
                jsonBody.put("lat", location.getLatitude());
                jsonBody.put("lng", location.getLongitude());
                jsonBody.put("source", "android_bg");
                if (speedKph >= 0) jsonBody.put("speed", speedKph);
                if (markerType != null && !markerType.isEmpty()) jsonBody.put("marker_type", markerType);
                
                float accuracy = location.hasAccuracy() ? location.getAccuracy() : 0f;
                jsonBody.put("accuracy", accuracy);

                String body = jsonBody.toString();

                OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                writer.write(body); writer.flush(); writer.close();
                int respCode = conn.getResponseCode();
                // [v4.2.57] 네트워크 HTTP 처리 및 CCTV 전송 보강
                if (respCode >= 200 && respCode < 300) {
                    conn.getInputStream().close();
                    sendNativeWebLog("NATIVE_POST_OK", "전송성공:" + respCode);
                } else {
                    java.io.InputStream es = conn.getErrorStream();
                    String responseBody = "";
                    if (es != null) {
                        java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(es));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = br.readLine()) != null) sb.append(line);
                        responseBody = sb.toString();
                        es.close();
                    }
                    String safeBody = body.replace("\"", "'");
                    sendNativeWebLog("NATIVE_POST_REJECT", "서버거절(" + respCode + "): " + responseBody + " | Payload: " + safeBody);
                }
                conn.disconnect();
                if (markerType != null) {
                    Log.d(TAG, "[MARKER] " + markerType + " 전송 완료 " + respCode);
                }

                // [v4.2.60] 네이티브-웹 데이터 동기화
                // 성공/실패 무관하게 GPS 수신 시도는 했으므로 타임스탬프 저장
                long now = System.currentTimeMillis();
                try {
                    SharedPreferences prefs = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                    prefs.edit().putString("LAST_NATIVE_GPS_TIME", String.valueOf(now)).apply();
                } catch (Exception ignored) {}

            } catch (Exception e) {
                Log.e(TAG, "GPS 전송 실패 (Network Block?): " + e.getMessage());
                // [v4.2.56] 네트워크 에러 발생 시 CCTV 전송
                sendNativeWebLog("NATIVE_ERR", "전송 실패: " + e.getMessage());
            }
        };
        // mNetworkHandler에서 이미 호출된 경우엔 직접 실행, 아니면 post
        if (android.os.Looper.myLooper() == mNetworkThread.getLooper()) {
            task.run();
        } else {
            mNetworkHandler.post(task);
        }
    }

    // ─── [v4.2.50] 네이티브 역지오코딩 (JS 완전 독립) ───────────────
    // nollae.com 서버 프록시 경유 → Kakao REST API 키 앱에 미노출
    private void geocodeAndUpdateOverlay(double lat, double lng) {
        try {
            String urlStr = String.format(Locale.US,
                BASE_URL + "/api/vehicle-tracking/geocode?lat=%.7f&lng=%.7f", lat, lng);
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            int code = conn.getResponseCode();
            if (code == 200) {
                java.io.BufferedReader br = new java.io.BufferedReader(
                    new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                conn.disconnect();
                // JSON에서 address 값 추출 (간단 파싱)
                String json = sb.toString();
                int idx = json.indexOf("\"address\":\"");
                if (idx >= 0) {
                    int start = idx + 11;
                    int end = json.indexOf("\"", start);
                    if (end > start) {
                        String addr = json.substring(start, end);
                        if (!addr.isEmpty()) {
                            mAddress = addr;
                            // MainLooper로 오버레이 TextView 즉시 갱신
                            new Handler(Looper.getMainLooper()).post(() -> {
                                if (tvAddr != null) tvAddr.setText(mAddress);
                            });
                            Log.d(TAG, "[GEOCODE] " + mAddress);
                        }
                    }
                }
            } else {
                conn.disconnect();
            }
        } catch (Exception e) {
            Log.e(TAG, "[GEOCODE] 실패: " + e.getMessage());
        }
    }

    // ─── 알림 ─────────────────────────────────────────────────────
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // [v4.2.50] IMPORTANCE_LOW → IMPORTANCE_DEFAULT
            // Samsung One UI: LOW는 앱을 절전 대상으로 분류 → DEFAULT 이상이어야 프로세스 생존
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "ELS 운행상태", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("운송 중 GPS 위치 추적");
            ch.setShowBadge(false);
            ch.enableVibration(false); // 진동 끔 (운전 중 방해 방지)
            ch.setSound(null, null);   // 소리 끔
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

    // ─── 네이티브 명령 폴링 (백그라운드 생존 보강) ────────────────
    private void pollSystemCommand() {
        if (mTripId == null || mTripId.isEmpty()) return;
        new Thread(() -> {
            try {
                URL url = new URL(BASE_URL + "/api/vehicle-tracking/emergency?unread=true");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                
                int code = conn.getResponseCode();
                if (code == 200) {
                    java.io.InputStream is = conn.getInputStream();
                    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(is));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    String data = sb.toString();
                    
                    // JSON 파싱 (간단히 문자열 매칭으로 속도 향상)
                    if (data.contains("SYSTEM_COMMAND")) {
                        if (data.contains("REALTIME_ON:" + mTripId)) {
                            mCurrentIntervalMs = 3000;
                            mGpsText = "실시간 수집중";
                            mGpsColor = "#f59e0b";
                            new Handler(Looper.getMainLooper()).post(this::updateWidgetDisplay);
                        } else if (data.contains("REALTIME_OFF:" + mTripId)) {
                            mCurrentIntervalMs = 60000;
                            mGpsText = "60s";
                            mGpsColor = "#10b981";
                            new Handler(Looper.getMainLooper()).post(this::updateWidgetDisplay);
                        }
                    }
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Native Poll Error: " + e.getMessage());
            }
        }).start();
    }

    // ─── 네이티브 로그 CCTV ───────────────────────────────────────
    private void sendNativeWebLog(String tag, String msg) {
        if (mNetworkHandler == null) return;
        mNetworkHandler.post(() -> {
            try {
                URL url = new URL(BASE_URL + "/api/debug/log");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(3000);
                
                JSONObject jsonBody = new JSONObject();
                jsonBody.put("msg", msg);
                jsonBody.put("device", "Android_Native");
                jsonBody.put("tag", tag);
                
                String body = jsonBody.toString();
                OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                writer.write(body); writer.flush(); writer.close();
                
                int respCode = conn.getResponseCode();
                if (respCode >= 200 && respCode < 300) conn.getInputStream().close();
                else conn.getErrorStream().close();
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Native CCTV Failed: " + e.getMessage());
            }
        });
    }

    // ─── 운행 종료 마지막 위치 전송 (JS에서 호출) ─────────────────
    public void sendFinalLocation() {
        if (mLastLocation != null) {
            sendLocationToServerWithMarker(mLastLocation, 0, "TRIP_END");
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mLastLocation != null && mTripId != null) {
            sendLocationToServerWithMarker(mLastLocation, 0, "TRIP_END");
        }
        if (mWindowManager != null && mFloatingWidget != null) {
            try { mWindowManager.removeView(mFloatingWidget); } catch (Exception ignored) {}
        }
        if (mFusedLocationClient != null && mLocationCallback != null) {
            mFusedLocationClient.removeLocationUpdates(mLocationCallback);
        }
        if (mSensorManager != null && mGyroListener != null) {
            mSensorManager.unregisterListener(mGyroListener);
        }
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }
        if (mTimerRunnable != null) mTimerHandler.removeCallbacks(mTimerRunnable);
        // [v4.2.51] HandlerThread 안전 종료
        if (mNetworkThread != null) mNetworkThread.quitSafely();
        // [v4.2.51] Keepalive 알람 취소
        // 운행 종료 시에만 취소 — 시스템이 서비스를 죽이면 취소 안 함 (재시작 필요)
        // STOP_SERVICE action으로 명시적으로 종료할 때만 취소
        if (mStatus == null || "completed".equals(mStatus)) {
            ServiceKeepaliveReceiver.cancelPing(this);
        }
        // Heartbeat 샬 제거 (Receiver가 짤 서비스임을 인지하도록)
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit().remove("SERVICE_HEARTBEAT").apply();
            
        // [v4.2.56] 서비스 종료 시 포그라운드 알림을 즉각 제거하여 알림바에서 소멸 느낌
        stopForeground(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancelAll();
        Log.d(TAG, "Service Destroyed");
    }

    // [v4.2.56] 앱 최근 목록(스와이프) 종료 시 포그라운드 서비스 및 알림 즉시 동반 종료
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "Task removed (App Swiped) -> Stopping Foreground Service");
        stopSelf();
    }
}
