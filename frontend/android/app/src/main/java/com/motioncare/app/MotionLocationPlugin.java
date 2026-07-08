package com.motioncare.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MotionLocation",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation")
    }
)
public class MotionLocationPlugin extends Plugin {
    private final MotionLocationService.MotionLocationListener listener = new MotionLocationService.MotionLocationListener() {
        @Override
        public void onLocationSample(MotionLocationSample sample) {
            notifyListeners("motionLocation", toJson(sample), true);
        }

        @Override
        public void onLocationStatus(String status, String message) {
            JSObject data = new JSObject();
            data.put("status", status);
            data.put("message", message);
            data.put("running", MotionLocationService.isRunning());
            notifyListeners("motionLocationStatus", data, true);
        }
    };

    @Override
    public void load() {
        MotionLocationService.addListener(listener);
    }

    @Override
    protected void handleOnDestroy() {
        MotionLocationService.removeListener(listener);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }
        startService(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), MotionLocationService.class);
        intent.setAction(MotionLocationService.ACTION_STOP);
        getContext().startService(intent);
        JSObject result = baseStatus();
        result.put("running", false);
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = baseStatus();
        result.put("running", MotionLocationService.isRunning());
        call.resolve(result);
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            startService(call);
        } else {
            call.reject("LOCATION_PERMISSION_REQUIRED");
        }
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), MotionLocationService.class);
        intent.setAction(MotionLocationService.ACTION_START);
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = baseStatus();
        result.put("running", true);
        call.resolve(result);
    }

    private JSObject baseStatus() {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("provider", "native-location-manager");
        result.put("foregroundGranted", getPermissionState("location") == PermissionState.GRANTED);
        result.put("backgroundGranted", Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("backgroundLocation") == PermissionState.GRANTED);
        return result;
    }

    private JSObject toJson(MotionLocationSample sample) {
        JSObject data = new JSObject();
        data.put("timestamp", sample.timestamp);
        data.put("latitude", sample.latitude);
        data.put("longitude", sample.longitude);
        data.put("provider", sample.provider);
        if (sample.altitude != null) {
            data.put("altitudeM", sample.altitude);
        }
        if (sample.accuracy != null) {
            data.put("accuracyM", sample.accuracy);
        }
        if (sample.bearing != null) {
            data.put("bearingDeg", sample.bearing);
        }
        if (sample.speed != null) {
            data.put("speedMps", sample.speed);
        }
        return data;
    }
}
