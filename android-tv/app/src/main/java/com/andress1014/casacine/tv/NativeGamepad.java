package com.andress1014.casacine.tv;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import java.util.LinkedHashMap;
import java.util.Map;

/** EmulatorJS 4.2.3 uses libretro joypad indices 0..15 and split analog axes 16..23. */
public final class NativeGamepad {
    public interface Sink { void input(int player,int control,int value); }
    private final Sink sink;
    private final Map<Integer,Pad> pads = new LinkedHashMap<>();
    private static final class Pad {
        int player;
        boolean[] keys = new boolean[16],axes = new boolean[16];
        int[] sent = new int[24];
    }
    public NativeGamepad(Sink sink) { this.sink=sink; }
    public static boolean controller(KeyEvent event) { return Controllers.isController(event.getDevice()) || event.isFromSource(InputDevice.SOURCE_GAMEPAD); }
    private Pad pad(int id) {
        Pad p=pads.get(id); if (p != null) return p;
        for (int slot=0;slot<2;slot++) {
            boolean occupied=false; for (Pad existing:pads.values()) if (existing.player==slot) occupied=true;
            if (occupied) continue;
            p=new Pad(); p.player=slot; pads.put(id,p); return p;
        }
        return null;
    }
    private void send(Pad p,int index,int value) { if (p.sent[index]!=value) { p.sent[index]=value; sink.input(p.player,index,value); } }
    private void digital(Pad p,int index) { send(p,index,p.keys[index] || p.axes[index] ? 1 : 0); }
    private static int button(int key) {
        switch (key) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0; // PS ✕ / SNES B (south)
            case KeyEvent.KEYCODE_BUTTON_X: return 1; // PS □ / SNES Y (west)
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 2;
            case KeyEvent.KEYCODE_BUTTON_START: return 3;
            case KeyEvent.KEYCODE_DPAD_UP: return 4;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 5;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 6;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 7;
            case KeyEvent.KEYCODE_BUTTON_B: case KeyEvent.KEYCODE_BACK: return 8; // PS ○ / SNES A (east)
            case KeyEvent.KEYCODE_BUTTON_Y: return 9; // PS △ / SNES X (north)
            case KeyEvent.KEYCODE_BUTTON_L1: return 10;
            case KeyEvent.KEYCODE_BUTTON_R1: return 11;
            case KeyEvent.KEYCODE_BUTTON_L2: return 12;
            case KeyEvent.KEYCODE_BUTTON_R2: return 13;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 14;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 15;
            default: return -1;
        }
    }
    public boolean key(KeyEvent event) {
        if (!controller(event)) return false; int index=button(event.getKeyCode()); if (index<0) return false;
        Pad p=pad(event.getDeviceId()); if (p==null) return true;
        if (event.getAction()==KeyEvent.ACTION_UP) p.keys[index]=false;
        else if (event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0) p.keys[index]=true;
        digital(p,index); return true;
    }
    private static float axis(MotionEvent event,int axis,int history) {
        InputDevice device=event.getDevice(); InputDevice.MotionRange range=device==null ? null : device.getMotionRange(axis,event.getSource());
        float v=history<0 ? event.getAxisValue(axis) : event.getHistoricalAxisValue(axis,history);
        return Math.abs(v)>Math.max(.15f,range==null ? 0 : range.getFlat()) ? Math.max(-1,Math.min(1,v)) : 0;
    }
    private void split(Pad p,int positive,int negative,float value) {
        send(p,positive,Math.round(Math.max(0,value)*32767)); send(p,negative,Math.round(Math.max(0,-value)*32767));
    }
    private void sample(Pad p,MotionEvent e,int history) {
        float x=axis(e,MotionEvent.AXIS_X,history),y=axis(e,MotionEvent.AXIS_Y,history);
        float hatX=axis(e,MotionEvent.AXIS_HAT_X,history),hatY=axis(e,MotionEvent.AXIS_HAT_Y,history);
        // Digital PS1 and SNES titles also accept left stick as their D-pad.
        p.axes[4]=hatY<-.5 || y<-.5; p.axes[5]=hatY>.5 || y>.5;
        p.axes[6]=hatX<-.5 || x<-.5; p.axes[7]=hatX>.5 || x>.5;
        for (int i=4;i<=7;i++) digital(p,i);
        p.axes[12]=Math.max(axis(e,MotionEvent.AXIS_LTRIGGER,history),axis(e,MotionEvent.AXIS_BRAKE,history))>.25;
        p.axes[13]=Math.max(axis(e,MotionEvent.AXIS_RTRIGGER,history),axis(e,MotionEvent.AXIS_GAS,history))>.25;
        digital(p,12); digital(p,13); split(p,16,17,x); split(p,18,19,y);
        InputDevice device=e.getDevice(); boolean alternative=device != null && device.getMotionRange(MotionEvent.AXIS_Z,e.getSource())==null;
        split(p,20,21,axis(e,alternative ? MotionEvent.AXIS_RX : MotionEvent.AXIS_Z,history));
        split(p,22,23,axis(e,alternative ? MotionEvent.AXIS_RY : MotionEvent.AXIS_RZ,history));
    }
    public boolean motion(MotionEvent event) {
        if (!event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.getActionMasked()!=MotionEvent.ACTION_MOVE) return false;
        Pad p=pad(event.getDeviceId()); if (p==null) return true;
        for (int h=0;h<event.getHistorySize();h++) sample(p,event,h);
        sample(p,event,-1); return true;
    }
    public void remove(int deviceId) {
        Pad p=pads.remove(deviceId); if (p!=null) for (int i=0;i<24;i++) if (p.sent[i]!=0) sink.input(p.player,i,0);
    }
    public void release() { for (int id:pads.keySet().toArray(new Integer[0])) remove(id); }
}
