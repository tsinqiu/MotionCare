package com.motioncare.app;

import android.location.Location;

public class MotionLocationSample {
    public final long timestamp;
    public final double latitude;
    public final double longitude;
    public final Double altitude;
    public final Float accuracy;
    public final Float bearing;
    public final Float speed;
    public final String provider;

    public MotionLocationSample(Location location) {
        timestamp = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        latitude = location.getLatitude();
        longitude = location.getLongitude();
        altitude = location.hasAltitude() ? location.getAltitude() : null;
        accuracy = location.hasAccuracy() ? location.getAccuracy() : null;
        bearing = location.hasBearing() ? location.getBearing() : null;
        speed = location.hasSpeed() ? location.getSpeed() : null;
        provider = location.getProvider() == null ? "native" : "native-" + location.getProvider();
    }
}
