package com.motioncare.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

public class MotionLocationService extends Service {
    public static final String ACTION_START = "com.motioncare.app.motionlocation.START";
    public static final String ACTION_STOP = "com.motioncare.app.motionlocation.STOP";
    private static final String CHANNEL_ID = "motioncare_workout_location";
    private static final int NOTIFICATION_ID = 7310;
    private static final Set<MotionLocationListener> listeners = new CopyOnWriteArraySet<>();
    private static volatile boolean running = false;

    private LocationManager locationManager;
    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            MotionLocationSample sample = new MotionLocationSample(location);
            for (MotionLocationListener listener : listeners) {
                listener.onLocationSample(sample);
            }
        }

        @Override
        public void onProviderEnabled(String provider) {
            emitStatus("provider_enabled", provider);
        }

        @Override
        public void onProviderDisabled(String provider) {
            emitStatus("provider_disabled", provider);
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
            emitStatus("provider_status", provider);
        }
    };

    public interface MotionLocationListener {
        void onLocationSample(MotionLocationSample sample);
        void onLocationStatus(String status, String message);
    }

    public static void addListener(MotionLocationListener listener) {
        listeners.add(listener);
    }

    public static void removeListener(MotionLocationListener listener) {
        listeners.remove(listener);
    }

    public static boolean isRunning() {
        return running;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundServiceNotification();
        startTracking();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopTracking();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startTracking() {
        if (!hasLocationPermission()) {
            emitStatus("permission_missing", "location permission is required");
            return;
        }

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            emitStatus("location_unavailable", "location manager unavailable");
            return;
        }

        try {
            requestProvider(LocationManager.GPS_PROVIDER);
            requestProvider(LocationManager.NETWORK_PROVIDER);
            running = true;
            emitStatus("running", "native location service running");
        } catch (SecurityException error) {
            running = false;
            emitStatus("permission_missing", "location permission is required");
        } catch (IllegalArgumentException error) {
            running = false;
            emitStatus("location_unavailable", error.getMessage());
        }
    }

    private void requestProvider(String provider) {
        if (locationManager == null || !locationManager.isProviderEnabled(provider)) {
            return;
        }
        locationManager.requestLocationUpdates(provider, 1000L, 3f, locationListener, Looper.getMainLooper());
        Location lastKnown = locationManager.getLastKnownLocation(provider);
        if (lastKnown != null) {
            locationListener.onLocationChanged(lastKnown);
        }
    }

    private void stopTracking() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (SecurityException ignored) {
                // Permission can disappear while the service is running.
            }
        }
        running = false;
        emitStatus("stopped", "native location service stopped");
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startForegroundServiceNotification() {
        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("MotionCare 正在记录运动")
            .setContentText("正在持续采集 GPS 轨迹、距离和配速")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "运动记录定位",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("运动中持续记录 GPS 轨迹");
        manager.createNotificationChannel(channel);
    }

    private static void emitStatus(String status, String message) {
        for (MotionLocationListener listener : listeners) {
            listener.onLocationStatus(status, message);
        }
    }
}
