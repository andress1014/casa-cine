package com.andress1014.casacine.tv;

/** A remote press is always ten seconds; key autorepeat never accelerates it. */
public final class RemoteSeek {
    public static final long STEP_MS = 10_000;
    private RemoteSeek() {}
    public static boolean accept(int action, int repeatCount) { return action == 0 && repeatCount == 0; }
    public static long target(long position, long duration, boolean forward) {
        long current = Math.max(0,position);
        long next = forward ? (current > Long.MAX_VALUE - STEP_MS ? Long.MAX_VALUE : current + STEP_MS) : Math.max(0,current - STEP_MS);
        return duration > 0 ? Math.min(duration,next) : next;
    }
}
