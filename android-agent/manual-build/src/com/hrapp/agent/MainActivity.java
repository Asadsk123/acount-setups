package com.hrapp.agent;

import android.app.Activity;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.UUID;

// ponytail: no lambdas/method-refs here — the bundled d8 (build-tools 34.0.0)
// chokes on some invokedynamic shapes emitted by javac 21 even at --release 17;
// anonymous inner classes sidestep it. Not an issue when built via build.bat
// (Gradle's own toolchain handles this correctly) — manual-build-only workaround.
public class MainActivity extends Activity {

    // Dev machine's LAN IP — phone and PC must be on the same WiFi network.
    private static final String RELAY_HOST = "10.28.206.21";
    private static final int RELAY_PORT = 8787;

    private TextView statusText;
    private TextView pairingCodeText;
    private TextView logText;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MiniWebSocket ws;
    private String deviceId;
    private MediaPlayer mediaPlayer;

    // Named field (not nested inside another anonymous class) — the bundled
    // d8 chokes on doubly-nested anonymous classes (MainActivity$1$1); see
    // note at top of file.
    private final Runnable retryConnect = new Runnable() {
        @Override public void run() { connect(); }
    };
    private final MediaPlayer.OnCompletionListener releaseOnComplete = new MediaPlayer.OnCompletionListener() {
        @Override public void onCompletion(MediaPlayer mp) { mp.release(); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 96, 48, 48);

        TextView title = new TextView(this);
        title.setText("HRAPP Agent (manual build)");
        title.setTextSize(20);
        root.addView(title);

        statusText = new TextView(this);
        statusText.setText("connecting...");
        root.addView(statusText);

        pairingCodeText = new TextView(this);
        pairingCodeText.setText("------");
        pairingCodeText.setTextSize(40);
        root.addView(pairingCodeText);

        logText = new TextView(this);
        logText.setText("");
        root.addView(logText);

        setContentView(root);
        connect();
    }

    private void connect() {
        setStatus("connecting to relay...");
        ws = new MiniWebSocket(RELAY_HOST, RELAY_PORT, "/", new MiniWebSocket.Listener() {
            @Override public void onOpen() {
                appendLog("relay connected");
                sendPairInit();
            }
            @Override public void onMessage(String text) {
                handleMessage(text);
            }
            @Override public void onFailure(Exception e) {
                setStatus("relay unreachable: " + e.getMessage());
                appendLog("connection failed, retrying in 5s");
                mainHandler.postDelayed(retryConnect, 5000);
            }
            @Override public void onClosed() {
                setStatus("disconnected");
            }
        });
        ws.connectAsync();
    }

    private void send(JSONObject json) {
        try {
            json.put("protocol_version", 1);
            json.put("timestamp", System.currentTimeMillis());
            ws.send(json.toString());
        } catch (Exception e) {
            appendLog("send failed: " + e.getMessage());
        }
    }

    private void sendPairInit() {
        try {
            JSONObject msg = new JSONObject();
            msg.put("message_type", "PAIR_INIT");
            msg.put("request_id", UUID.randomUUID().toString());
            send(msg);
        } catch (Exception e) { appendLog("PAIR_INIT build failed: " + e.getMessage()); }
    }

    private void handleMessage(String text) {
        try {
            JSONObject msg = new JSONObject(text);
            String type = msg.optString("message_type");
            if ("PAIR_INIT_RESPONSE".equals(type)) {
                JSONObject payload = msg.getJSONObject("payload");
                deviceId = payload.getString("device_id");
                final String code = payload.getString("pairing_code");
                mainHandler.post(new Runnable() {
                    @Override public void run() { pairingCodeText.setText(code); }
                });
                appendLog("pairing code issued: " + code);
                sendAuth();
            } else if ("AUTH_RESPONSE".equals(type)) {
                setStatus("OK".equals(msg.optString("status")) ? "paired - waiting for commands" : "auth failed");
            } else if ("PLAY_SOUND".equals(type)) {
                String soundId = msg.getJSONObject("payload").optString("sound_id", "tan_tan");
                appendLog("PLAY_SOUND received: " + soundId);
                playSound();
                sendPlaySoundResult();
            }
        } catch (Exception e) {
            appendLog("bad message: " + e.getMessage());
        }
    }

    private void sendAuth() {
        try {
            JSONObject msg = new JSONObject();
            msg.put("message_type", "AUTH_REQUEST");
            msg.put("device_id", deviceId);
            msg.put("role", "agent");
            send(msg);
        } catch (Exception e) { appendLog("AUTH_REQUEST build failed: " + e.getMessage()); }
    }

    private void sendPlaySoundResult() {
        try {
            JSONObject msg = new JSONObject();
            msg.put("message_type", "PLAY_SOUND_RESULT");
            msg.put("device_id", deviceId);
            JSONObject payload = new JSONObject();
            payload.put("result", "PLAYED");
            msg.put("payload", payload);
            send(msg);
            appendLog("PLAY_SOUND_RESULT sent");
        } catch (Exception e) { appendLog("PLAY_SOUND_RESULT build failed: " + e.getMessage()); }
    }

    private void playSound() {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                if (mediaPlayer != null) mediaPlayer.release();
                mediaPlayer = MediaPlayer.create(MainActivity.this, R.raw.tan_tan);
                if (mediaPlayer != null) {
                    mediaPlayer.setOnCompletionListener(releaseOnComplete);
                    mediaPlayer.start();
                }
            }
        });
    }

    private void setStatus(final String text) {
        mainHandler.post(new Runnable() {
            @Override public void run() { statusText.setText(text); }
        });
    }

    private void appendLog(final String line) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                String current = logText.getText().toString();
                String next = line + "\n" + current;
                logText.setText(next.length() > 2000 ? next.substring(0, 2000) : next);
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (ws != null) ws.close();
        if (mediaPlayer != null) mediaPlayer.release();
    }
}
