package com.andress1014.casacine.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ImageView;
import android.widget.Toast;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class PlayerActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService tasks = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private ServerClient client;
    private String id, key;
    private PlayerView view;
    private DefaultTimeBar timeBar;
    private ExoPlayer player;
    private TextView title, feedback;
    private LinearLayout tools;
    private boolean fromStart, errorVisible;
    private FrameLayout idleArtwork;
    private ImageView idleBackground;
    private TextView idleTitle;
    private boolean artworkReady, idleVisible;
    private int idleResumeKey = -1;
    private static final long IDLE_ARTWORK_MS = 30_000;
    private final Runnable showIdleArtwork = () -> {
        if (player == null || errorVisible || !artworkReady || player.getPlayWhenReady()) return;
        int state = player.getPlaybackState();
        if (state != Player.STATE_READY && state != Player.STATE_ENDED) return;
        idleVisible = true; view.hideController(); idleArtwork.setVisibility(View.VISIBLE);
    };
    private int generation;
    private final Runnable hideFeedback = () -> feedback.setVisibility(View.GONE);
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
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(Ui.BG);
        view = new PlayerView(this); view.setUseController(true); view.setControllerShowTimeoutMs(5000);
        view.setShowRewindButton(true); view.setShowFastForwardButton(true); view.setShowNextButton(false); view.setShowPreviousButton(false);
        view.setShowSubtitleButton(true); view.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        view.setKeepContentOnPlayerReset(true); view.setBackgroundColor(Ui.BG);
        root.addView(view,new FrameLayout.LayoutParams(-1,-1));
        timeBar = view.findViewById(androidx.media3.ui.R.id.exo_progress);
        if (timeBar != null) timeBar.setKeyTimeIncrement(RemoteSeek.STEP_MS);
        if (view.getSubtitleView() != null) { view.getSubtitleView().setUserDefaultStyle(); view.getSubtitleView().setUserDefaultTextSize(); }
        LinearLayout top = Ui.column(this); top.setBackgroundColor(0xcc101510); top.setPadding(Ui.dp(this,30),Ui.dp(this,16),Ui.dp(this,30),Ui.dp(this,12));
        title = Ui.text(this,"Palomita · Preparando función…",20,Ui.TEXT,true); top.addView(title); Ui.space(top,8);
        tools = new LinearLayout(this); tools.setGravity(Gravity.CENTER_VERTICAL);
        addTool("Subtítulos",() -> tracks(C.TRACK_TYPE_TEXT,"Subtítulos")); addTool("Audio",() -> tracks(C.TRACK_TYPE_AUDIO,"Audio"));
        addTool("Velocidad",this::speed); addTool("Imagen",this::imageSize); addTool("Créditos",this::credits); addTool("Volver",this::finish);
        top.addView(tools); Ui.space(top,6); top.addView(Ui.text(this,"Barra / ◀▶: 10 s por pulsación · OK: pausa · Atrás: controles / cartelera",11,Ui.MUTED,false));
        root.addView(top,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
        idleArtwork = new FrameLayout(this); idleArtwork.setBackgroundColor(Ui.BG); idleArtwork.setVisibility(View.GONE); idleArtwork.setFocusable(false);
        idleBackground = new ImageView(this); idleBackground.setScaleType(ImageView.ScaleType.CENTER_CROP);
        idleArtwork.addView(idleBackground,new FrameLayout.LayoutParams(-1,-1));
        View shade = new View(this); shade.setBackgroundColor(0xb8101510); idleArtwork.addView(shade,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout idleInfo = Ui.column(this); idleInfo.setPadding(Ui.dp(this,45),Ui.dp(this,30),Ui.dp(this,45),Ui.dp(this,35));
        idleInfo.addView(Ui.text(this,"PALOMITA · TU FUNCIÓN EN PAUSA",14,Ui.LIME,true)); Ui.space(idleInfo,14);
        idleTitle = Ui.text(this,"",38,Ui.TEXT,true); idleInfo.addView(idleTitle); Ui.space(idleInfo,12);
        idleInfo.addView(Ui.text(this,"Pulsa OK para continuar · Cualquier otra tecla vuelve a controles",16,Ui.TEXT,false));
        idleArtwork.addView(idleInfo,new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM)); root.addView(idleArtwork,new FrameLayout.LayoutParams(-1,-1));
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> top.setVisibility(visibility));
        feedback = Ui.text(this,"",27,Ui.TEXT,true); feedback.setBackground(Ui.panel(0xe0202b19,Ui.LIME,this)); feedback.setPadding(24,16,24,16); feedback.setVisibility(View.GONE);
        FrameLayout.LayoutParams feedbackParams = new FrameLayout.LayoutParams(-2,-2,Gravity.CENTER); root.addView(feedback,feedbackParams);
        setContentView(root);
    }
    private void addTool(String label,Runnable action) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2,-2); p.setMargins(0,0,Ui.dp(this,9),0); tools.addView(Ui.button(this,label,action),p); }
    @Override protected void onStart() {
        super.onStart(); if (client == null || view == null) return; int request = ++generation;
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory().setConnectTimeoutMs(7000).setReadTimeoutMs(15000).setAllowCrossProtocolRedirects(false);
        if (!client.cookie().isEmpty()) http.setDefaultRequestProperties(Collections.singletonMap("Cookie",client.cookie()));
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(http))
            .setSeekBackIncrementMs(RemoteSeek.STEP_MS).setSeekForwardIncrementMs(RemoteSeek.STEP_MS).build();
        // Exact seeking avoids landing a distant keyframe away from the requested ten seconds.
        player.setSeekParameters(SeekParameters.EXACT);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredAudioLanguages("es","spa").setPreferredTextLanguages("es","spa").build());
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) { showError(false); }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) { savePosition(); player.pause(); }
                updateIdleArtwork();
            }
            @Override public void onPlayWhenReadyChanged(boolean ready,int reason) { updateIdleArtwork(); }
            @Override public void onIsPlayingChanged(boolean playing) { updateIdleArtwork(); }
        });
        view.setPlayer(player); view.requestFocus(); view.showController();
        tasks.execute(() -> {
            try {
                Media media = client.media(id);
                List<MediaItem.SubtitleConfiguration> subtitles = new ArrayList<>();
                for (Media.Subtitle track : media.subtitles) subtitles.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(client.subtitleUrl(id,track.id)))
                    .setMimeType(MimeTypes.TEXT_VTT).setId(track.id).setLabel(track.label).setLanguage(track.language)
                    .setSelectionFlags(track.forced ? C.SELECTION_FLAG_FORCED : 0).build());
                MediaItem item = new MediaItem.Builder().setUri(client.streamUrl(id)).setSubtitleConfigurations(subtitles)
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(media.title).build()).build();
                main.post(() -> {
                    if (request != generation || player == null) return;
                    title.setText("Palomita · " + media.title); idleTitle.setText(media.title); player.setMediaItem(item);
                    if (!fromStart) player.seekTo(Math.max(0,prefs.getLong(key,0))); fromStart = false;
                    player.prepare(); player.setPlayWhenReady(true); main.postDelayed(save,5000);
                });
                Bitmap artwork = client.artwork(media);
                main.post(() -> {
                    if (request != generation || player == null || artwork == null) return;
                    idleBackground.setImageBitmap(artwork); artworkReady = true; updateIdleArtwork();
                });
            } catch (ServerClient.AccessRequired error) { main.post(() -> { if (request == generation) showError(true); }); }
            catch (Exception error) { main.post(() -> { if (request == generation) showError(false); }); }
        });
    }
    private void showError(boolean access) {
        if (errorVisible || isFinishing() || player == null) return; errorVisible = true;
        hideIdleArtwork(); main.removeCallbacks(showIdleArtwork);
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle(access ? "Código de casa" : "Pausa inesperada")
            .setMessage(access ? "Vuelve a cartelera para ingresar código de casa." : "Revisa PC encendida y conexión Wi-Fi. Puedes reintentar desde mismo punto o volver a cartelera.")
            .setNegativeButton("Volver",(d,w) -> finish()).setOnDismissListener(d -> errorVisible = false);
        if (!access) dialog.setPositiveButton("Reintentar",(d,w) -> {
            if (player.getMediaItemCount() > 0) { player.prepare(); player.play(); }
            else { recreate(); }
        });
        dialog.show();
    }
    private void tracks(int type,String label) {
        if (player == null) return;
        boolean available = false;
        for (androidx.media3.common.Tracks.Group group : player.getCurrentTracks().getGroups()) if (group.getType() == type && group.isSupported()) { available = true; break; }
        if (!available) { Toast.makeText(this,type == C.TRACK_TYPE_TEXT ? "Sin subtítulos. Añade SRT/VTT desde Palomita en PC." : "Sin pista de audio compatible.",Toast.LENGTH_LONG).show(); return; }
        new TrackSelectionDialogBuilder(this,label,player,type).setShowDisableOption(type == C.TRACK_TYPE_TEXT).build().show();
    }
    private void speed() {
        final float[] speeds = {0.75f,1f,1.25f,1.5f,2f}; final String[] labels = {"0.75×","Normal · 1×","1.25×","1.5×","2×"};
        new AlertDialog.Builder(this).setTitle("Velocidad").setItems(labels,(d,index) -> { if (player != null) player.setPlaybackSpeed(speeds[index]); }).show();
    }
    private void imageSize() {
        new AlertDialog.Builder(this).setTitle("Imagen").setItems(new String[]{"Completa · conserva proporción","Llenar pantalla · recorta bordes"},(d,index) -> view.setResizeMode(index == 0 ? AspectRatioFrameLayout.RESIZE_MODE_FIT : AspectRatioFrameLayout.RESIZE_MODE_ZOOM)).show();
    }
    private void credits() {
        LinearLayout content = Ui.column(this); content.setPadding(30,24,30,24);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.tmdb_logo); logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        content.addView(logo,new LinearLayout.LayoutParams(Ui.dp(this,140),Ui.dp(this,35))); Ui.space(content,16);
        content.addView(Ui.text(this,"This product uses the TMDB API but is not endorsed or certified by TMDB.",14,Ui.TEXT,false));
        Ui.space(content,10); content.addView(Ui.text(this,"The Movie Database · https://www.themoviedb.org",12,Ui.MUTED,false));
        new AlertDialog.Builder(this).setTitle("Créditos · Palomita").setView(content).setPositiveButton("Cerrar",(d,w) -> {}).show();
    }
    private void hideIdleArtwork() {
        idleVisible = false; if (idleArtwork != null) idleArtwork.setVisibility(View.GONE);
    }
    private void updateIdleArtwork() {
        main.removeCallbacks(showIdleArtwork);
        if (player == null || player.getPlayWhenReady() || errorVisible) { hideIdleArtwork(); return; }
        if (!idleVisible && artworkReady && (player.getPlaybackState() == Player.STATE_READY || player.getPlaybackState() == Player.STATE_ENDED)) main.postDelayed(showIdleArtwork,IDLE_ARTWORK_MS);
    }
    private void artworkInteraction() {
        boolean shown = idleVisible; hideIdleArtwork(); main.removeCallbacks(showIdleArtwork);
        if (shown && view != null) view.showController(); updateIdleArtwork();
    }
    private void seek(boolean forward) {
        if (player == null || !player.isCurrentMediaItemSeekable()) return;
        player.seekTo(RemoteSeek.target(player.getCurrentPosition(),player.getDuration(),forward));
        feedback.setText(forward ? "+10 segundos" : "−10 segundos"); feedback.setVisibility(View.VISIBLE); main.removeCallbacks(hideFeedback); main.postDelayed(hideFeedback,800);
        view.showController(); if (timeBar != null) timeBar.requestFocus(); savePosition();
    }
    private void savePosition() {
        if (player == null || key == null) return;
        long length = player.getDuration(), position = player.getCurrentPosition();
        if (length != C.TIME_UNSET && length > 0 && position >= 0) prefs.edit().putLong(key,player.getPlaybackState() == Player.STATE_ENDED || position >= length - 2000 ? 0 : position).apply();
    }
    @Override protected void onStop() {
        generation++; main.removeCallbacks(save); main.removeCallbacks(hideFeedback); main.removeCallbacks(showIdleArtwork); hideIdleArtwork(); artworkReady = false;
        if (idleBackground != null) idleBackground.setImageDrawable(null);
        savePosition(); if (view != null) view.setPlayer(null);
        if (player != null) { player.release(); player = null; } super.onStop();
    }
    @Override protected void onDestroy() { main.removeCallbacksAndMessages(null); tasks.shutdownNow(); super.onDestroy(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (view == null || player == null || errorVisible) return super.dispatchKeyEvent(event);
        int code = event.getKeyCode();
        if (code == idleResumeKey) {
            if (event.getAction() == KeyEvent.ACTION_UP) idleResumeKey = -1;
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            boolean shown = idleVisible; artworkInteraction();
            if (shown && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_MEDIA_PLAY)) {
                idleResumeKey = code;
                if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                player.play(); return true;
            }
        }
        boolean forward = code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || code == KeyEvent.KEYCODE_DPAD_RIGHT;
        boolean seek = code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || code == KeyEvent.KEYCODE_MEDIA_REWIND
            || ((code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT) && (!view.isControllerFullyVisible() || (timeBar != null && timeBar.hasFocus())));
        if (seek) { if (RemoteSeek.accept(event.getAction(),event.getRepeatCount())) seek(forward); return true; }
        if (code == KeyEvent.KEYCODE_BACK && view.isControllerFullyVisible()) { if (event.getAction() == KeyEvent.ACTION_UP) view.hideController(); return true; }
        if (code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_MEDIA_PLAY || code == KeyEvent.KEYCODE_MEDIA_PAUSE || (code == KeyEvent.KEYCODE_DPAD_CENTER && (!view.isControllerFullyVisible() || (timeBar != null && timeBar.hasFocus())))) {
            if (RemoteSeek.accept(event.getAction(),event.getRepeatCount())) { if (code == KeyEvent.KEYCODE_MEDIA_PAUSE || (code != KeyEvent.KEYCODE_MEDIA_PLAY && player.isPlaying())) player.pause(); else player.play(); view.showController(); } return true;
        }
        if (event.getRepeatCount() > 0 && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER)) return true;
        // Dispatch once through Activity: duplicate PlayerView dispatch can double remote actions.
        return super.dispatchKeyEvent(event);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) artworkInteraction();
        return super.dispatchTouchEvent(event);
    }
}
