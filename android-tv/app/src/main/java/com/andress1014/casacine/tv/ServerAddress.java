package com.andress1014.casacine.tv;

import java.net.URI;

/** Only literal private IPv4 addresses: no DNS, proxies, paths or credentials. */
public final class ServerAddress {
    private ServerAddress() {}
    public static String normalize(String input) {
        String text = input == null ? "" : input.trim();
        if (text.length() > 128) throw new IllegalArgumentException("Dirección demasiado larga.");
        if (!text.contains("://")) text = "http://" + text;
        try {
            URI uri = new URI(text);
            String host = uri.getHost();
            if (!"http".equals(uri.getScheme()) || !isPrivate(host) || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException();
            }
            int port = uri.getPort() == -1 ? 3210 : uri.getPort();
            if (port < 1 || port > 65535) throw new IllegalArgumentException();
            return "http://" + host + ":" + port;
        } catch (Exception error) {
            throw new IllegalArgumentException("Usa IP local de PC. Ejemplo: 192.168.1.50:3210");
        }
    }
    public static boolean isPrivate(String host) {
        if (host == null) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("0|[1-9][0-9]{0,2}")) return false;
            octets[i] = Integer.parseInt(parts[i]);
            if (octets[i] > 255) return false;
        }
        return octets[0] == 10 || (octets[0] == 192 && octets[1] == 168)
            || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] == 169 && octets[1] == 254);
    }
}
