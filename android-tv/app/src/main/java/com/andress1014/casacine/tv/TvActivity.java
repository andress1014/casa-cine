package com.andress1014.casacine.tv;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

/** Standard Android controller keys also navigate the native TV screens. */
public class TvActivity extends Activity {
    private int direction;
    private int directionDevice;
    private final Handler menu = new Handler(Looper.getMainLooper());
    private final Runnable repeatDirection = new Runnable() {
        @Override public void run() {
            if (direction==0 || !hasWindowFocus()) { resetMenuNavigation(); return; }
            move(); menu.postDelayed(this,180);
        }
    };
    private void move() {
        long now=SystemClock.uptimeMillis();
        dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,direction,0,0,directionDevice,0,0,InputDevice.SOURCE_DPAD));
        dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_UP,direction,0,0,directionDevice,0,0,InputDevice.SOURCE_DPAD));
    }
    protected void resetMenuNavigation() { direction=0; menu.removeCallbacks(repeatDirection); }
    @Override protected void onPause() { resetMenuNavigation(); super.onPause(); }
    @Override public void onWindowFocusChanged(boolean focus) { if (!focus) resetMenuNavigation(); super.onWindowFocusChanged(focus); }
    protected static KeyEvent menuKey(KeyEvent event) {
        int mapped = event.getKeyCode() == KeyEvent.KEYCODE_BUTTON_A ? KeyEvent.KEYCODE_DPAD_CENTER
            : event.getKeyCode() == KeyEvent.KEYCODE_BUTTON_B ? KeyEvent.KEYCODE_BACK : 0;
        if (mapped != 0) return new KeyEvent(event.getDownTime(),event.getEventTime(),event.getAction(),mapped,
            event.getRepeatCount(),event.getMetaState(),event.getDeviceId(),0,event.getFlags(),InputDevice.SOURCE_DPAD);
        return event;
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) { return super.dispatchKeyEvent(menuKey(event)); }
    @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (!event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.getActionMasked() != MotionEvent.ACTION_MOVE) return super.dispatchGenericMotionEvent(event);
        float x = event.getAxisValue(MotionEvent.AXIS_HAT_X), y = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
        if (Math.abs(x) < .5f && Math.abs(y) < .5f) { x = event.getAxisValue(MotionEvent.AXIS_X); y = event.getAxisValue(MotionEvent.AXIS_Y); }
        int code = Math.max(Math.abs(x),Math.abs(y)) < .5f ? 0 : Math.abs(x) > Math.abs(y)
            ? x < 0 ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_RIGHT
            : y < 0 ? KeyEvent.KEYCODE_DPAD_UP : KeyEvent.KEYCODE_DPAD_DOWN;
        if (code != 0 && code != direction) {
            menu.removeCallbacks(repeatDirection); direction=code; directionDevice=event.getDeviceId(); move(); menu.postDelayed(repeatDirection,350);
        }
        if (code == 0) resetMenuNavigation();
        return true;
    }
}
