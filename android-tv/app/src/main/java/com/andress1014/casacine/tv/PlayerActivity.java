package com.andress1014.casacine.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import java.util.Collections;

public final class PlayerActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private ServerClient client;
    private String id, key;
    private PlayerView view;
    private ExoPlayer player;
    private boolean fromStart, errorVisible;
    private final Runnable save = new Runnable() {
        @Override public void run() { savePosition(); main.postDelayed(this,5000); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs = getSharedPreferences("casacine",MODE_PRIVATE);
        try {
            id = getIntent().getStringExtra("id"); ServerClient.validateId(id);
            client = new ServerClient(prefs.getString("server","")); key = "position:" + client.base + ":" + id;
        } catch (IllegalArgumentException error) { finish(); return; }
        fromStart = state == null && getIntent().getBooleanExtra("fromStart",false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        view = new PlayerView(this); view.setUseController(true); view.setControllerShowTimeoutMs(5000);
        view.setShowRewindButton(true); view.setShowFastForwardButton(true); view.setShowNextButton(false); view.setShowPreviousButton(false);
        view.setKeepContentOnPlayerReset(true); view.setBackgroundColor(Ui.BG); setContentView(view);
    }
    @Override protected void onStart() {
        super.onStart(); if (client == null || view == null) return;
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory().setConnectTimeoutMs(7000).setReadTimeoutMs(15000).setAllowCrossProtocolRedirects(false);
        if (!client.cookie().isEmpty()) http.setDefaultRequestProperties(Collections.singletonMap("Cookie",client.cookie()));
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(http))
            .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) {
                if (errorVisible || isFinishing()) return; errorVisible = true;
                new AlertDialog.Builder(PlayerActivity.this).setTitle("Volvamos a conectar")
                    .setMessage("Revisa PC encendida y Wi-Fi. Si cambiaste código de casa, vuelve a entrar desde cartelera.")
                    .setPositiveButton("Volver",(d,w) -> finish()).setOnCancelListener(d -> finish()).show();
            }
        });
        view.setPlayer(player); player.setMediaItem(MediaItem.fromUri(client.streamUrl(id)));
        if (!fromStart) player.seekTo(Math.max(0,prefs.getLong(key,0))); fromStart = false;
        player.prepare(); player.setPlayWhenReady(true); view.requestFocus(); view.showController(); main.postDelayed(save,5000);
    }
    private void savePosition() {
        if (player == null || key == null) return;
        long length = player.getDuration(), position = player.getCurrentPosition();
        if (length != C.TIME_UNSET && length > 0 && position >= 0) prefs.edit().putLong(key,position >= length * 0.95 ? 0 : position).apply();
    }
    @Override protected void onStop() {
        main.removeCallbacks(save); savePosition(); if (view != null) view.setPlayer(null);
        if (player != null) { player.release(); player = null; } super.onStop();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (view != null && view.dispatchKeyEvent(event)) return true; return super.dispatchKeyEvent(event);
    }
}
