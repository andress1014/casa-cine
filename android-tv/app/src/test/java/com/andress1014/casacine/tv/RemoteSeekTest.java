package com.andress1014.casacine.tv;
import org.junit.Test;
import static org.junit.Assert.*;
public class RemoteSeekTest {
    @Test public void longMovieStillSeeksTenSeconds() { assertEquals(3_610_000,RemoteSeek.target(3_600_000,10_800_000,true)); }
    @Test public void clampsAtBothEnds() { assertEquals(0,RemoteSeek.target(5000,7200000,false)); assertEquals(7200000,RemoteSeek.target(7199000,7200000,true)); }
    @Test public void ignoresHeldKeyRepeatsAndKeyUp() { assertTrue(RemoteSeek.accept(0,0)); for (int i=1;i<200;i++) assertFalse(RemoteSeek.accept(0,i)); assertFalse(RemoteSeek.accept(1,0)); }
    @Test public void repeatedTapsArePredictable() { long position=0; for (int i=0;i<30;i++) position=RemoteSeek.target(position,10800000,true); assertEquals(300000,position); }
    @Test public void unknownDurationAndOverflowAreSafe() { assertEquals(10000,RemoteSeek.target(-1,-1,true)); assertEquals(Long.MAX_VALUE,RemoteSeek.target(Long.MAX_VALUE,-1,true)); }
}
