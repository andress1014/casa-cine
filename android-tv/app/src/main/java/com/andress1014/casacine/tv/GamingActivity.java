package com.andress1014.casacine.tv;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** TV library uses the same games and player UUIDs as Guarida web. */
public final class GamingActivity extends TvActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService tasks = Executors.newFixedThreadPool(3);
    private final LruCache<String,Bitmap> covers = new LruCache<String,Bitmap>(8*1024*1024) {
        @Override protected int sizeOf(String key,Bitmap bitmap) { return bitmap.getByteCount(); }
    };
    private SharedPreferences prefs;
    private ServerClient client;
    private List<Game> games = new ArrayList<>(), visible = new ArrayList<>();
    private JSONArray players = new JSONArray();
    private String selectedPlayer = "",playerName = "",filter = "all",search = "",focusedGameId = "";
    private TextView status,empty,profile,identity;
    private Button collectionButton,heroPlay;
    private TextView heroTitle;
    private ImageView backdrop;
    private Game featured;
    private String artworkKey="";
    private Runnable artworkDelay;
    private GridView grid;
    private boolean busy,engineReady,resumed;
    private int generation;
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (resumed) { refresh(); main.postDelayed(this,10000); } }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs = getSharedPreferences("casacine",MODE_PRIVATE);
        try { client = new ServerClient(prefs.getString("server","")); } catch (Exception e) { finish(); return; }
        selectedPlayer = prefs.getString("game-player:"+client.base,"");
        Ui.TvShell shell=Ui.shell(this,"Gaming",prefs.getString("user-name","")+" · "+DeviceIdentity.deviceName(this),
            () -> returnToMain("inicio"),() -> returnToMain("cine"),
            () -> {},this::searchDialog,this::options,this::chooseProfile);
        LinearLayout root=shell.content; backdrop=shell.backdrop; identity=shell.identity;
        LinearLayout heading=new LinearLayout(this); heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(Ui.text(this,"ZONA GAMING",16,Ui.MUTED,true),new LinearLayout.LayoutParams(0,-2,1));
        collectionButton=Ui.compact(this,"Todas las consolas  ▾",this::chooseConsole); heading.addView(collectionButton); root.addView(heading); Ui.space(root,10);
        LinearLayout hero=Ui.column(this); heroTitle=Ui.text(this,"Tu próxima partida",36,Ui.TEXT,true); heroTitle.setMaxLines(2); heroTitle.setEllipsize(android.text.TextUtils.TruncateAt.END); hero.addView(heroTitle,new LinearLayout.LayoutParams(Ui.dp(this,500),-2)); Ui.space(hero,4);
        profile=Ui.text(this,"Escoge jugador desde Opciones",13,0xFFA6AEBD,false); hero.addView(profile); Ui.space(hero,6);
        hero.addView(Ui.text(this,"Tus clásicos, en pantalla grande.",14,0xFFCCD3DE,false)); Ui.space(hero,10);
        heroPlay=Ui.primary(this,"▶ Jugar ahora",() -> { if (featured!=null) launch(featured); }); heroPlay.setTextSize(14); hero.addView(heroPlay,new LinearLayout.LayoutParams(-2,Ui.dp(this,42)));
        root.addView(hero,new LinearLayout.LayoutParams(-1,Ui.dp(this,184))); Ui.space(root,10);
        LinearLayout caption=new LinearLayout(this); caption.setGravity(Gravity.CENTER_VERTICAL); caption.addView(Ui.text(this,"Tu biblioteca",18,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        status=Ui.text(this,"Cargando…",12,Ui.MUTED,false); caption.addView(status); root.addView(caption); Ui.space(root,8);
        empty=Ui.text(this,"",20,Ui.TEXT,true); empty.setGravity(Gravity.CENTER); root.addView(empty);
        grid=new GridView(this); grid.setNumColumns(4); grid.setHorizontalSpacing(Ui.dp(this,18)); grid.setVerticalSpacing(Ui.dp(this,18));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH); grid.setClipToPadding(false); grid.setPadding(4,4,4,4); grid.setSelector(android.R.color.transparent); grid.setAdapter(new Cards());
        grid.setOnItemClickListener((p,v,index,id) -> launch(visible.get(index)));
        grid.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent,View view,int index,long id) { if (index>=0 && index<visible.size()) { focusedGameId=visible.get(index).id; feature(visible.get(index)); } }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        root.addView(grid,new LinearLayout.LayoutParams(-1,0,1)); Ui.space(root,10);
        root.addView(Ui.text(this,"✕ / OK: jugar  ·  ○ / Atrás: inicio",12,Ui.MUTED,false)); collectionButton.requestFocus();
    }
    private void options() {
        new AlertDialog.Builder(this).setTitle("Opciones de Gaming").setItems(new String[]{"Cambiar jugador","Mandos y Bluetooth","Actualizar biblioteca"},(d,index) -> {
            if (index==0) chooseProfile(); else if (index==1) Controllers.help(this); else refresh();
        }).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private void returnToMain(String section) {
        Intent intent=new Intent(this,MainActivity.class); intent.putExtra("section",section);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP); startActivity(intent); finish();
    }
    @Override public void onBackPressed() { returnToMain("inicio"); }
    private void chooseConsole() {
        String[] labels={"Todas las consolas","PlayStation 1","Super Nintendo"},values={"all","psx","snes"};
        int selected=0; for (int i=0;i<values.length;i++) if (values[i].equals(filter)) selected=i;
        new AlertDialog.Builder(this).setTitle("Consolas").setSingleChoiceItems(labels,selected,(d,index) -> {
            filter=values[index]; collectionButton.setText(labels[index]+"  ▾"); applyFilter(); d.dismiss();
        }).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private void ui(Runnable action) { main.post(() -> { if (!isFinishing() && !isDestroyed()) action.run(); }); }
    @Override protected void onResume() { super.onResume(); resumed=true; if (client != null) main.post(poll); }
    @Override protected void onPause() { resumed=false; main.removeCallbacks(poll); super.onPause(); }
    @Override protected void onDestroy() { generation++; main.removeCallbacksAndMessages(null); tasks.shutdownNow(); super.onDestroy(); }
    private void refresh() {
        if (busy || client == null) return; busy=true; int request=++generation;
        tasks.execute(() -> {
            try {
                JSONObject config=client.gamingConfig(); List<Game> fetched=client.games(); JSONArray profiles=client.gamePlayers();
                ui(() -> { if (request != generation) return; busy=false; games=fetched; players=profiles; engineReady=config.optBoolean("emulatorReady");
                    playerName="";
                    for (int i=0;i<players.length();i++) { JSONObject p=players.optJSONObject(i); if (p != null && selectedPlayer.equals(p.optString("id"))) playerName=p.optString("name"); }
                    if (playerName.isEmpty()) selectedPlayer="";
                    if (selectedPlayer.isEmpty() && players.length()==1) selectProfile(players.optJSONObject(0));
                    updateProfile(); applyFilter();
                });
            } catch (ServerClient.AccessRequired access) { ui(() -> { busy=false; startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)); finish(); }); }
            catch (Exception error) { ui(() -> { if (request != generation) return; busy=false; status.setText("Sin conexión Gaming. Revisa PC encendida y Guarida actualizado."); }); }
        });
    }
    private void updateProfile() { identity.setText((playerName.isEmpty() ? prefs.getString("user-name","") : playerName)+" · "+DeviceIdentity.deviceName(this)); profile.setText((featured==null ? "" : featured.console()+"  ·  ")+(playerName.isEmpty() ? "Escoge jugador desde Opciones" : "Jugador: "+playerName)); }
    private void selectProfile(JSONObject p) {
        if (p==null) return;
        try { ServerClient.validateId(p.optString("id")); } catch (Exception invalid) { return; }
        selectedPlayer=p.optString("id"); playerName=p.optString("name"); prefs.edit().putString("game-player:"+client.base,selectedPlayer).apply(); updateProfile();
    }
    private void chooseProfile() {
        if (busy) { Toast.makeText(this,"Espera a que carguen perfiles.",Toast.LENGTH_SHORT).show(); return; }
        String[] labels=new String[players.length()]; for (int i=0;i<labels.length;i++) labels[i]=players.optJSONObject(i).optString("name");
        new AlertDialog.Builder(this).setTitle("¿Quién juega?").setItems(labels,(d,index) -> selectProfile(players.optJSONObject(index)))
            .setPositiveButton("Crear perfil",(d,w) -> newProfile()).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private void newProfile() {
        EditText input=new EditText(this); input.setSingleLine(true); input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});
        input.setText(prefs.getString("user-name",""));
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Nombre de jugador").setView(input).setNegativeButton("Cancelar",(d,w) -> {}).setPositiveButton("Guardar",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String name=DeviceIdentity.clean(input.getText().toString()); if (name.isEmpty()) { input.setError("Escribe nombre."); return; }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            tasks.execute(() -> { try { JSONObject p=client.createGamePlayer(name); ui(() -> { selectProfile(p); dialog.dismiss(); refresh(); }); }
                catch (Exception e) { ui(() -> { input.setError("No pudimos crear perfil. Reintenta."); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true); }); } });
        })); dialog.show();
    }
    private void searchDialog() {
        EditText input=new EditText(this); input.setSingleLine(true); input.setText(search);
        new AlertDialog.Builder(this).setTitle("Buscar juego").setView(input).setPositiveButton("Buscar",(d,w) -> { search=input.getText().toString().trim(); applyFilter(); })
            .setNeutralButton("Limpiar",(d,w) -> { search=""; applyFilter(); }).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private void applyFilter() {
        int selection=Math.max(0,grid.getSelectedItemPosition()); String selected=focusedGameId;
        visible=new ArrayList<>(); for (Game g:games) if (("all".equals(filter)||filter.equals(g.system)) && g.title.toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))) visible.add(g);
        ((Cards)grid.getAdapter()).notifyDataSetChanged();
        for (int i=0;i<visible.size();i++) if (selected.equals(visible.get(i).id)) selection=i;
        if (!visible.isEmpty()) { selection=Math.min(selection,visible.size()-1); grid.setSelection(selection); feature(visible.get(selection)); }
        else { featured=null; heroPlay.setEnabled(false); heroTitle.setText("Tu próxima partida"); updateProfile(); artworkKey=""; backdrop.setImageDrawable(null); }
        empty.setVisibility(visible.isEmpty() ? View.VISIBLE : View.GONE); empty.setText(games.isEmpty() ? "Tu próxima partida empieza en PC. Sube juegos desde Gaming." : "Sin juegos en esta búsqueda.");
        status.setText(engineReady ? visible.size()+" juegos" : "Prepara motor Gaming en PC");
    }
    private void feature(Game game) {
        featured=game; heroTitle.setText(game.title); heroPlay.setEnabled(engineReady); updateProfile();
        String key=game.id+":"+game.cover; if (key.equals(artworkKey)) return; artworkKey=key;
        if (artworkDelay!=null) main.removeCallbacks(artworkDelay);
        Bitmap cached=covers.get(key); backdrop.setImageBitmap(cached); backdrop.setAlpha(.78f);
        if (cached!=null || game.cover.isEmpty()) return;
        artworkDelay=() -> tasks.execute(() -> { try { Bitmap image=client.gameCover(game.id); if (image!=null) { covers.put(key,image); ui(() -> { if (key.equals(artworkKey)) { backdrop.setImageBitmap(image); backdrop.setAlpha(0); backdrop.animate().alpha(.78f).setDuration(220).start(); } }); } } catch (Exception ignored) { } });
        main.postDelayed(artworkDelay,180);
    }
    private void launch(Game game) {
        if (!engineReady) { Toast.makeText(this,"Instala motor Gaming en PC.",Toast.LENGTH_LONG).show(); return; }
        if (selectedPlayer.isEmpty()) { chooseProfile(); return; }
        new AlertDialog.Builder(this).setTitle(game.title).setMessage(game.console()+" · "+playerName+"\n\nMando conectado a TV. Mantén Options o pulsa Atrás del control remoto para menú.")
            .setPositiveButton("Continuar",(d,w) -> play(game,true)).setNeutralButton("Desde inicio",(d,w) -> play(game,false)).setNegativeButton("Cancelar",(d,w) -> {}).show();
    }
    private void play(Game game,boolean resume) {
        Intent intent=new Intent(this,GamePlayerActivity.class); intent.putExtra("game",game.id); intent.putExtra("player",selectedPlayer);
        intent.putExtra("title",game.title); intent.putExtra("resume",resume); startActivity(intent);
    }
    private final class Cards extends BaseAdapter {
        @Override public int getCount() { return visible.size(); }
        @Override public Game getItem(int index) { return visible.get(index); }
        @Override public long getItemId(int index) { return index; }
        @Override public View getView(int index,View recycled,ViewGroup parent) {
            Game game=getItem(index); LinearLayout card=Ui.column(GamingActivity.this); int pad=Ui.dp(GamingActivity.this,4); card.setPadding(pad,pad,pad,pad);
            android.graphics.drawable.StateListDrawable bg=new android.graphics.drawable.StateListDrawable();
            bg.addState(new int[]{android.R.attr.state_selected},Ui.panel(0x88101621,Ui.LIME,GamingActivity.this)); bg.addState(new int[]{},Ui.panel(0x88101621,android.graphics.Color.TRANSPARENT,GamingActivity.this)); card.setBackground(bg);
            FrameLayout artwork=new FrameLayout(GamingActivity.this); ImageView image=new ImageView(GamingActivity.this); image.setScaleType(ImageView.ScaleType.CENTER_CROP);
            artwork.setBackground(Ui.panel(0xFF101621,android.graphics.Color.TRANSPARENT,GamingActivity.this)); artwork.setClipToOutline(true);
            FrameLayout placeholder=Ui.gamePlaceholder(GamingActivity.this,game.system); artwork.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));
            artwork.addView(image,new FrameLayout.LayoutParams(-1,-1));
            card.addView(artwork,new LinearLayout.LayoutParams(-1,Ui.dp(GamingActivity.this,110)));
            TextView title=Ui.text(GamingActivity.this,game.title,15,Ui.TEXT,true); title.setMaxLines(1); title.setEllipsize(android.text.TextUtils.TruncateAt.END); card.addView(title);
            card.addView(Ui.text(GamingActivity.this,game.console(),11,0xFFA6AEBD,false)); card.setLayoutParams(new AbsListView.LayoutParams(-1,Ui.dp(GamingActivity.this,160)));
            card.setFocusable(false); card.setContentDescription(game.title+", "+game.console());
            if (!game.cover.isEmpty()) { String key=game.id+":"+game.cover; image.setTag(key); Bitmap cached=covers.get(key);
                if (cached != null) { image.setImageBitmap(cached); placeholder.setVisibility(View.GONE); }
                else tasks.execute(() -> { try { Bitmap bitmap=client.gameCover(game.id); if (bitmap != null) { covers.put(key,bitmap); ui(() -> { if (key.equals(image.getTag())) { image.setImageBitmap(bitmap); placeholder.setVisibility(View.GONE); } }); } } catch (Exception ignored) {} });
            }
            return card;
        }
    }
}
