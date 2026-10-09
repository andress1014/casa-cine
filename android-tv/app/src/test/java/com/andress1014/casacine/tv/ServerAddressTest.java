package com.andress1014.casacine.tv;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServerAddressTest {
    @Test public void acceptsLanWithDefaultAndCustomPort() {
        assertEquals("http://192.168.1.50:3210", ServerAddress.normalize("192.168.1.50"));
        assertEquals("http://10.0.2.2:3210", ServerAddress.normalize("http://10.0.2.2:3210/"));
        assertEquals("http://172.16.1.1:4000", ServerAddress.normalize("172.16.1.1:4000"));
    }
    @Test public void rejectsPublicOrAmbiguousTargets() {
        String[] invalid = {"https://192.168.1.5", "8.8.8.8", "google.com", "localhost", "127.0.0.1", "172.32.0.1",
            "192.168.1.300", "192.168.01.1", "192.168.1.1/path", "192.168.1.1?token=x", "192.168.1.1#x",
            "http://user:password@192.168.1.1", "192.168.1.1:0", "192.168.1.1:65536", "file:///tmp/video"};
        for (String address : invalid) {
            try { ServerAddress.normalize(address); fail("Accepted invalid address: " + address); }
            catch (IllegalArgumentException expected) { }
        }
    }
}
