package com.andress1014.casacine.tv;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Bundled, trusted game page. Network resources are restricted to this home's server. */
public final class GamePlayerActivity extends TvActivity implements InputManager.InputDeviceListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private TextView message;
    private ServerClient client;
    private InputManager devices;
    private NativeGamepad gamepad;
    private String game,profile;
    private boolean started,foreground,menuVisible,helpVisible,exitPending,exportPending,destroyed,inputScheduled;
    private JSONArray inputBatch = new JSONArray();
    private final Bridge bridge = new Bridge();
    private final Runnable flushInput = () -> {
        inputScheduled=false;
        if (inputBatch.length()==0 || web==null || destroyed) return;
        JSONArray batch=inputBatch; inputBatch=new JSONArray();
        web.evaluateJavascript("window.GuaridaGaming && window.GuaridaGaming.input("+batch+")",null);
    };
    private final Runnable hideMessage = () -> { if (message != null) message.setVisibility(View.GONE); };
    private final Runnable optionsHeld = this::showMenu;
    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            client=new ServerClient(getSharedPreferences("casacine",MODE_PRIVATE).getString("server",""));
            game=getIntent().getStringExtra("game"); profile=getIntent().getStringExtra("player"); ServerClient.validateId(game); ServerClient.validateId(profile);
        } catch (Exception invalid) { finish(); return; }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root=new FrameLayout(this); root.setBackgroundColor(Ui.BG); setContentView(root);
        web=new WebView(this); root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setFocusable(true); web.setFocusableInTouchMode(true); web.addJavascriptInterface(bridge,"GuaridaTV");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) { return true; }
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                if (allowed(request.getUrl())) return null;
                return new WebResourceResponse("text/plain","utf-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) {
                if (request.isForMainFrame()) showMessage("No pudimos abrir motor. Revisa conexión y actualiza Android System WebView en TV.",false);
            }
            @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail) {
                started=false; web=null; root.removeView(view); view.destroy();
                new AlertDialog.Builder(GamePlayerActivity.this).setTitle("Motor se cerró").setMessage("TV se quedó sin recursos para esta partida. Progreso guardado sigue en Windows.")
                    .setPositiveButton("Volver",(d,w) -> finish()).setCancelable(false).show(); return true;
            }
        });
        message=Ui.text(this,"Preparando "+getIntent().getStringExtra("title")+"…",16,Ui.TEXT,false);
        message.setPadding(20,12,20,12); message.setBackground(Ui.panel(Ui.PANEL,Ui.MUTED,this));
        FrameLayout.LayoutParams hint=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.START); hint.setMargins(20,20,20,20); root.addView(message,hint);
        gamepad=new NativeGamepad((player,control,value) -> {
            if (!started || destroyed) return;
            inputBatch.put(new JSONArray().put(player).put(control).put(value));
            if (inputBatch.length()>=384) { main.removeCallbacks(flushInput); flushInput.run(); }
            else if (!inputScheduled) { inputScheduled=true; main.postDelayed(flushInput,16); }
        });
        devices=(InputManager)getSystemService(INPUT_SERVICE);
        CookieManager cookies=CookieManager.getInstance(); cookies.setAcceptCookie(true); cookies.setAcceptThirdPartyCookies(web,false);
        String cookie=client.cookie().isEmpty() ? "casacine=; Path=/; Max-Age=0" : client.cookie()+"; Path=/; HttpOnly; SameSite=Strict";
        cookies.setCookie(client.base,cookie,accepted -> { if (!destroyed && web != null) { cookies.flush(); loadPage(); } });
    }
    private boolean allowed(Uri uri) {
        Uri server=Uri.parse(client.base); String path=uri.getPath();
        return server.getScheme().equals(uri.getScheme()) && server.getHost().equals(uri.getHost()) && server.getPort()==uri.getPort() && uri.getUserInfo()==null && path != null
            && (path.startsWith("/api/gaming/") || path.startsWith("/emulatorjs/"));
    }
    private String asset(String filename) throws Exception {
        try (InputStream stream=getAssets().open(filename); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192]; int count; while ((count=stream.read(buffer))!=-1) bytes.write(buffer,0,count);
            return bytes.toString("UTF-8");
        }
    }
    private void loadPage() {
        try {
            JSONObject launch=new JSONObject().put("game",game).put("player",profile).put("resume",getIntent().getBooleanExtra("resume",true));
            String csp="default-src 'self'; script-src 'self' 'unsafe-inline' blob: 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'";
            String html="<!doctype html><html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='Content-Security-Policy' content=\""+csp+"\"><style>"+asset("player.css")+"#message{display:none}</style></head><body><div id='game'></div><p id='message'></p><script>window.GuaridaTVLaunch="+launch+";</script><script>"+asset("player.js").replace("</script","<\\/script")+"</script></body></html>";
            web.loadDataWithBaseURL(client.base+"/gaming-player/player.html",html,"text/html","UTF-8",null); web.requestFocus();
        } catch (Exception unavailable) { showMessage("No pudimos abrir motor Gaming. Vuelve a biblioteca.",false); }
    }
    private void command(String command) {
        if (web != null && !destroyed) web.evaluateJavascript("window.GuaridaGaming && window.GuaridaGaming.command("+JSONObject.quote(command)+")",null);
    }
    private void releaseInput() { resetMenuNavigation(); if (gamepad != null) gamepad.release(); main.removeCallbacks(flushInput); flushInput.run(); main.removeCallbacks(optionsHeld); }
    private void showMessage(String text,boolean temporary) {
        if (destroyed || message==null) return; main.removeCallbacks(hideMessage); message.setText(text); message.setVisibility(text.isEmpty() ? View.GONE : View.VISIBLE);
        if (temporary && !text.isEmpty()) main.postDelayed(hideMessage,5000);
    }
    private void resumeGame() { if (foreground && started && !menuVisible && !helpVisible && !exitPending) { command("resume"); web.requestFocus(); } }
    private void showMenu() {
        if (destroyed || menuVisible || helpVisible) return;
        if (exitPending) { showMessage("Guardando partida antes de salir…",false); return; }
        menuVisible=true; releaseInput(); command("suspend");
        String[] actions=started ? new String[]{"Continuar","Guardar partida","Cargar partida","Exportar copia en TV","Mandos","Guardar y salir","Salir sin guardar"}
            : new String[]{"Empezar partida","Mandos","Volver a biblioteca"};
        new AlertDialog.Builder(this).setTitle(getIntent().getStringExtra("title")).setItems(actions,(d,index) -> {
            if (!started) {
                if (index==0) command("start"); if (index==1) help(); if (index==2) finish(); return;
            }
            if (index==1) command("save"); if (index==2) command("load");
            if (index==3) { exportPending=true; helpVisible=true; command("export"); }
            if (index==4) help();
            if (index==5) { exitPending=true; showMessage("Guardando partida antes de salir…",false); command("exit"); }
            if (index==6) confirmExit();
        }).setOnDismissListener(d -> { menuVisible=false; resumeGame(); }).show();
    }
    private void help() {
        helpVisible=true; Controllers.help(this,() -> { helpVisible=false; resumeGame(); });
    }
    private void confirmExit() {
        helpVisible=true;
        new AlertDialog.Builder(this).setTitle("¿Salir sin guardar?").setMessage("Cambios desde último guardado pueden perderse. Puedes exportar copia antes de salir.")
            .setPositiveButton("Salir",(d,w) -> finish()).setNegativeButton("Continuar",(d,w) -> {})
            .setOnDismissListener(d -> { helpVisible=false; resumeGame(); }).show();
    }
    @Override public void onBackPressed() { showMenu(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (!menuVisible && !helpVisible && foreground && gamepad != null) {
            if (event.getKeyCode()==KeyEvent.KEYCODE_BACK && !NativeGamepad.controller(event)) {
                if (event.getAction()==KeyEvent.ACTION_UP) showMenu(); return true;
            }
            if (NativeGamepad.controller(event) && event.getKeyCode()==KeyEvent.KEYCODE_BUTTON_MODE) {
                if (event.getAction()==KeyEvent.ACTION_UP) showMenu(); return true;
            }
            if (!started && (event.getKeyCode()==KeyEvent.KEYCODE_BUTTON_A || event.getKeyCode()==KeyEvent.KEYCODE_DPAD_CENTER)) {
                if (event.getAction()==KeyEvent.ACTION_UP) command("start"); return true;
            }
            if (started) {
                if (event.getKeyCode()==KeyEvent.KEYCODE_BUTTON_START && NativeGamepad.controller(event)) {
                    if (event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0) main.postDelayed(optionsHeld,800);
                    if (event.getAction()==KeyEvent.ACTION_UP) main.removeCallbacks(optionsHeld);
                }
                if (gamepad.key(event)) return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (started && foreground && !menuVisible && !helpVisible && gamepad != null && gamepad.motion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }
    @Override protected void onResume() {
        super.onResume(); foreground=true;
        if (web != null) { web.onResume(); devices.registerInputDeviceListener(this,main); resumeGame(); }
    }
    @Override protected void onPause() {
        foreground=false; releaseInput(); command("suspend"); if (devices != null) devices.unregisterInputDeviceListener(this);
        if (web != null) web.onPause(); super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed=true; bridge.cancelExport(); main.removeCallbacksAndMessages(null);
        if (web != null) { web.removeJavascriptInterface("GuaridaTV"); web.stopLoading(); web.destroy(); web=null; } super.onDestroy();
    }
    @Override public void onInputDeviceAdded(int id) { showMessage(Controllers.status(),true); }
    @Override public void onInputDeviceChanged(int id) { if (gamepad != null) gamepad.remove(id); }
    @Override public void onInputDeviceRemoved(int id) { if (gamepad != null) gamepad.remove(id); if (started && Controllers.connected().isEmpty()) { showMessage("Mando desconectado. Partida en pausa.",false); showMenu(); } }
    public final class Bridge {
        private File temporary;
        private FileOutputStream export;
        private long expected,written;
        @JavascriptInterface public void onEvent(String type,String text) {
            if (type==null || text==null || type.length()>24 || text.length()>2000) return;
            main.post(() -> {
                if (destroyed) return;
                if ("started".equals(type)) { resetMenuNavigation(); started=true; showMessage("Partida lista · Mantén Options para menú",true); if (!foreground || menuVisible || helpVisible) command("suspend"); }
                else if ("exit".equals(type)) finish();
                else if ("error".equals(type)) {
                    showMessage(text,false);
                    if (exportPending) { exportPending=false; helpVisible=false; showMenu(); }
                    if (exitPending) { exitPending=false; showMenu(); }
                }
                else if (!text.isEmpty()) showMessage(text,true);
            });
        }
        @JavascriptInterface public synchronized boolean exportStart(int size) {
            cancelExport(); if (destroyed || size<=0 || size>64*1024*1024) return false;
            try {
                File folder=getExternalFilesDir("Documents"); if (folder==null) return false;
                temporary=new File(folder,"guarida-"+game+"-"+System.currentTimeMillis()+".state.part");
                export=new FileOutputStream(temporary); expected=size; written=0; return true;
            } catch (Exception failed) { cancelExport(); return false; }
        }
        @JavascriptInterface public synchronized boolean exportChunk(String data) {
            if (destroyed || export==null || data==null || data.length()>32768) { cancelExport(); return false; }
            try {
                byte[] chunk=Base64.decode(data,Base64.NO_WRAP);
                if (chunk.length==0 || written+chunk.length>expected) { cancelExport(); return false; }
                export.write(chunk); written+=chunk.length; return true;
            } catch (Exception failed) { cancelExport(); return false; }
        }
        @JavascriptInterface public synchronized boolean exportFinish() {
            if (export==null || written!=expected) { cancelExport(); return false; }
            try {
                export.close(); export=null; File file=new File(temporary.getPath().replace(".part",""));
                if (!temporary.renameTo(file)) throw new Exception(); temporary=null;
                main.post(() -> {
                    if (!destroyed) new AlertDialog.Builder(GamePlayerActivity.this).setTitle("Copia exportada").setMessage(file.getPath()).setPositiveButton("Cerrar",(d,w) -> {})
                        .setOnDismissListener(d -> { exportPending=false; helpVisible=false; resumeGame(); }).show();
                });
                return true;
            } catch (Exception failed) { cancelExport(); return false; }
        }
        synchronized void cancelExport() {
            if (export!=null) try { export.close(); } catch (Exception ignored) {} export=null;
            if (temporary!=null) temporary.delete(); temporary=null;
        }
    }
}
