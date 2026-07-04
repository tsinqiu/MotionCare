package com.motioncare.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MotionLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
