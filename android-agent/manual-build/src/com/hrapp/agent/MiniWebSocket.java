package com.hrapp.agent;

import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * ponytail: hand-rolled RFC 6455 client (unmasked-server / masked-client text
 * frames only, no fragmentation, no TLS) — written specifically to avoid
 * needing OkHttp+Kotlin-stdlib jars for this sandboxed manual-build proof.
 * The real Gradle project (../app) uses OkHttp; this class exists only in
 * manual-build/ and should NOT be treated as the long-term implementation —
 * swap back to OkHttp once `build.bat` can run (see docs/PROJECT_PROGRESS.md).
 * Ceiling: single-threaded blocking reads, one text frame per read() call.
 */
public class MiniWebSocket {
    public interface Listener {
        void onOpen();
        void onMessage(String text);
        void onFailure(Exception e);
        void onClosed();
    }

    private final String host;
    private final int port;
    private final String path;
    private final Listener listener;
    private Socket socket;
    private OutputStream out;
    private InputStream in;
    private volatile boolean running = true;

    public MiniWebSocket(String host, int port, String path, Listener listener) {
        this.host = host;
        this.port = port;
        this.path = path;
        this.listener = listener;
    }

    public void connectAsync() {
        new Thread(new Runnable() {
            @Override public void run() { runLoop(); }
        }, "mini-ws").start();
    }

    private void runLoop() {
        try {
            socket = new Socket(host, port);
            out = socket.getOutputStream();
            in = socket.getInputStream();
            handshake();
            listener.onOpen();
            readLoop();
        } catch (Exception e) {
            listener.onFailure(e);
        } finally {
            try { if (socket != null) socket.close(); } catch (IOException ignored) {}
            listener.onClosed();
        }
    }

    private void handshake() throws IOException {
        byte[] keyBytes = new byte[16];
        new SecureRandom().nextBytes(keyBytes);
        String key = Base64.getEncoder().encodeToString(keyBytes);

        String req = "GET " + path + " HTTP/1.1\r\n" +
                "Host: " + host + ":" + port + "\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: " + key + "\r\n" +
                "Sec-WebSocket-Version: 13\r\n\r\n";
        out.write(req.getBytes(StandardCharsets.UTF_8));
        out.flush();

        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        boolean sawSwitchingProtocols = false;
        while ((line = reader.readLine()) != null && !line.isEmpty()) {
            if (line.startsWith("HTTP/1.1 101")) sawSwitchingProtocols = true;
        }
        if (!sawSwitchingProtocols) throw new IOException("WebSocket handshake failed");
        // Note: not validating Sec-WebSocket-Accept — acceptable for this
        // trusted-dev-relay demo, NOT for a production client.
    }

    public synchronized void send(String text) {
        try {
            byte[] payload = text.getBytes(StandardCharsets.UTF_8);
            byte[] mask = new byte[4];
            new SecureRandom().nextBytes(mask);
            ByteArrayOutputStream frame = new ByteArrayOutputStream();
            frame.write(0x81); // FIN + text frame opcode
            int len = payload.length;
            if (len <= 125) {
                frame.write(0x80 | len);
            } else if (len <= 65535) {
                frame.write(0x80 | 126);
                frame.write((len >> 8) & 0xFF);
                frame.write(len & 0xFF);
            } else {
                throw new IOException("payload too large for this demo client");
            }
            frame.write(mask);
            for (int i = 0; i < len; i++) {
                frame.write(payload[i] ^ mask[i % 4]);
            }
            out.write(frame.toByteArray());
            out.flush();
        } catch (IOException e) {
            listener.onFailure(e);
        }
    }

    private void readLoop() throws IOException {
        while (running) {
            int b0 = in.read();
            if (b0 == -1) return;
            int opcode = b0 & 0x0F;
            int b1 = in.read();
            boolean masked = (b1 & 0x80) != 0; // server frames are unmasked per spec, but handle both
            int len = b1 & 0x7F;
            if (len == 126) {
                len = (in.read() << 8) | in.read();
            } else if (len == 127) {
                for (int i = 0; i < 8; i++) in.read(); // skip extended len (demo scope: no >64KB frames)
                len = (in.read() << 8) | in.read();
            }
            byte[] maskKey = null;
            if (masked) {
                maskKey = new byte[4];
                for (int i = 0; i < 4; i++) maskKey[i] = (byte) in.read();
            }
            byte[] payload = new byte[len];
            int readTotal = 0;
            while (readTotal < len) {
                int r = in.read(payload, readTotal, len - readTotal);
                if (r == -1) return;
                readTotal += r;
            }
            if (masked) {
                for (int i = 0; i < len; i++) payload[i] ^= maskKey[i % 4];
            }
            if (opcode == 0x8) { running = false; return; } // close frame
            if (opcode == 0x1) { // text frame
                listener.onMessage(new String(payload, StandardCharsets.UTF_8));
            }
        }
    }

    public void close() {
        running = false;
        try { if (socket != null) socket.close(); } catch (IOException ignored) {}
    }
}
