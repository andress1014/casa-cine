package com.andress1014.casacine.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends TvActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService tasks = Executors.newFixedThreadPool(4);
    private final LruCache<String, Bitmap> posters = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getByteCount(); }
    };
    private SharedPreferences prefs;
    private ServerClient client;
    private List<Media> library = new ArrayList<>(), visible = new ArrayList<>();
    private String filter = "Todo", search = "", signature = "", focusedMediaId = "";
    private GridView grid;
    private TextView status, empty, identity, controllerLabel;
    private LinearLayout results;
    private EditText address;
    private ImageView backdrop;
    private TextView heroTitle,heroInfo,heroDescription;
    private Button heroPlay;
    private Media featured;
    private String artworkKey="";
    private Runnable artworkDelay;
    private final LruCache<String,Bitmap> backgrounds=new LruCache<String,Bitmap>(8*1024*1024) { @Override protected int sizeOf(String key,Bitmap bitmap) { return bitmap.getByteCount(); } };
    private boolean busy, resumed, catalogue, loginVisible, discovering;
    private int generation;
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (resumed && catalogue) refresh(false); if (resumed && controllerLabel != null) controllerLabel.setText(Controllers.status()); if (resumed) main.postDelayed(this,6000); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs = getSharedPreferences("casacine",MODE_PRIVATE);
        String saved = prefs.getString("server",""); showConnection();
        if (saved != null && !saved.isEmpty()) connect(saved); else discover();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; main.removeCallbacks(poll); main.post(poll); if (catalogue) { updateIdentity(); applyFilter(); } }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (client != null && intent.hasExtra("section")) {
            String section=intent.getStringExtra("section"); intent.removeExtra("section");
            if ("cine".equals(section)) { showCatalogue(); applyFilter(); } else showHub();
        }
    }
    @Override protected void onPause() { resumed = false; main.removeCallbacks(poll); super.onPause(); }
    @Override protected void onDestroy() { main.removeCallbacksAndMessages(null); tasks.shutdownNow(); super.onDestroy(); }
    private void ui(Runnable action) { main.post(() -> { if (!isFinishing() && !isDestroyed()) action.run(); }); }
    private void toast(String message) { Toast.makeText(this,message,Toast.LENGTH_LONG).show(); }
    private LinearLayout screen() {
        LinearLayout root = Ui.column(this); root.setBackgroundColor(Ui.BG);
        int pad = Ui.dp(this,36); root.setPadding(pad,Ui.dp(this,24),pad,Ui.dp(this,18)); setContentView(root); return root;
    }
    private LinearLayout row() { LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); return row; }
    private void button(LinearLayout row, String label, Runnable action) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2,-2); params.setMargins(0,0,Ui.dp(this,10),0);
        row.addView(Ui.button(this,label,action),params);
    }
    private EditText input(String value, String hint, int max) {
        EditText input = new EditText(this); input.setText(value); input.setHint(hint); input.setTextColor(Ui.TEXT); input.setHintTextColor(Ui.MUTED);
        input.setSingleLine(true); input.setSelectAllOnFocus(true); input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)}); return input;
    }
    private void showConnection() {
        generation++; catalogue = false; busy = false; client = null; grid = null; identity = null; controllerLabel = null; backdrop=null; artworkKey=""; if (artworkDelay!=null) main.removeCallbacks(artworkDelay); library.clear(); visible.clear(); signature = "";
        LinearLayout root = screen(); root.addView(Ui.text(this,"guarida.  ✳",44,Ui.LIME,true)); Ui.space(root,14);
        root.addView(Ui.text(this,"Tu casa tiene pantalla grande",27,Ui.TEXT,true)); Ui.space(root,12);
        root.addView(Ui.text(this,"Enciende Guarida en PC. Conecta TV al mismo Wi-Fi.",18,Ui.MUTED,false)); Ui.space(root,16);
        root.addView(Ui.text(this,DeviceIdentity.deviceName(this),16,Ui.MUTED,false));
        address = input(prefs.getString("server",""),"IP de PC: 192.168.1.50:3210",128);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        root.addView(address,new LinearLayout.LayoutParams(Ui.dp(this,460),Ui.dp(this,54))); Ui.space(root,12);
        LinearLayout controls = row(); button(controls,"Conectar",() -> connect(address.getText().toString())); button(controls,"Buscar en Wi-Fi",this::discover); root.addView(controls);
        Ui.space(root,16); status = Ui.text(this,"Buscaremos PC dentro de casa.",16,Ui.MUTED,false); root.addView(status);
        results = Ui.column(this); root.addView(results,new LinearLayout.LayoutParams(-1,0,1));
        root.addView(Ui.text(this,"Sube videos desde PC o teléfono. Aquí usa control remoto.",14,Ui.MUTED,false)); controls.getChildAt(0).requestFocus();
    }
    private void discover() {
        if (discovering) return; discovering = true; int request = generation; status.setText("Buscando Palomita en Wi-Fi…");
        tasks.execute(() -> { List<String> servers = ServerClient.discover(); ui(() -> {
            discovering = false; if (request != generation || catalogue) return; results.removeAllViews();
            if (servers.size() == 1) { address.setText(servers.get(0)); connect(servers.get(0)); }
            else if (servers.isEmpty()) status.setText("Sin detección automática. Escribe IP que muestra Palomita en PC.");
            else { status.setText("Escoge PC de casa:"); for (String server : servers) results.addView(Ui.button(this,server,() -> connect(server))); }
        }); });
    }
    private void connect(String value) {
        if (busy) return;
        try { client = new ServerClient(value); } catch (IllegalArgumentException error) { status.setText(error.getMessage()); return; }
        int request = ++generation; ServerClient selected = client; busy = true; status.setText("Entrando a tu videoclub…");
        tasks.execute(() -> {
            try {
                if (!selected.authenticated()) throw new ServerClient.AccessRequired(); List<Media> fetched = selected.library();
                ui(() -> { if (request != generation) return; busy = false; prefs.edit().putString("server",selected.base).apply(); library = fetched;
                    if ("cine".equals(getIntent().getStringExtra("section"))) { getIntent().removeExtra("section"); showCatalogue(); applyFilter(); }
                    else showHub();
                    if (prefs.getString("user-name","").isEmpty()) profile(); });
            } catch (ServerClient.AccessRequired error) { ui(() -> { if (request == generation) { busy = false; askCode(selected); } }); }
            catch (Exception error) { ui(() -> { if (request == generation) { busy = false; status.setText("Sin conexión. Revisa PC encendida, IP y firewall de red privada."); } }); }
        });
    }
    private void askCode(ServerClient selected) {
        if (loginVisible) return; loginVisible = true;
        EditText code = input("","Código de casa",128); code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Código de casa").setView(code).setNegativeButton("Cancelar",(d,w) -> {}).setPositiveButton("Entrar",null).create();
        dialog.setOnDismissListener(d -> loginVisible = false);
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = code.getText().toString(); Button enter = dialog.getButton(AlertDialog.BUTTON_POSITIVE); enter.setEnabled(false); int request = generation;
            tasks.execute(() -> {
                try { selected.login(value); ui(() -> { if (request == generation) { code.setText(""); dialog.dismiss(); if (catalogue) refresh(true); else connect(selected.base); } }); }
                catch (Exception error) { ui(() -> { if (request == generation) { code.setError("Código incorrecto o sin conexión. Tras varios intentos espera un minuto."); enter.setEnabled(true); } }); }
            });
        })); dialog.show();
    }
    private LinearLayout hubScreen(String section) {
        Ui.TvShell shell=Ui.shell(this,section,"",this::showHub,
            () -> { showCatalogue(); applyFilter(); },
            () -> startActivity(new Intent(this,GamingActivity.class)),
            () -> { if (!catalogue) { showCatalogue(); applyFilter(); } searchDialog(); },this::options,this::profile);
        identity=shell.identity; backdrop=shell.backdrop; artworkKey=""; updateIdentity(); return shell.content;
    }
    private void options() {
        String[] labels=catalogue ? new String[]{"Agregar / quitar favorito","Actualizar cartelera","Mi perfil","Conectar mando PS5","Cambiar PC"}
            : new String[]{"Mi perfil","Conectar mando PS5","Cambiar PC"};
        new AlertDialog.Builder(this).setTitle("Opciones").setItems(labels,(d,index) -> {
            if (catalogue) {
                if (index==0) toggleSelectedFavourite();
                else if (index==1) refresh(true);
                else if (index==2) profile();
                else if (index==3) Controllers.help(this);
                else showConnection();
            } else {
                if (index==0) profile(); else if (index==1) Controllers.help(this); else showConnection();
            }
        }).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private void chooseCollection() {
        String[] collections={"Todo","Películas","Series","En familia","Recuerdos","Otros","Favoritos","Seguir viendo"};
        int selected=Arrays.asList(collections).indexOf(filter);
        new AlertDialog.Builder(this).setTitle("Tu cartelera").setSingleChoiceItems(collections,selected,(d,index) -> {
            filter=collections[index]; collectionButton.setText(filter+"  ▾"); applyFilter(); d.dismiss();
        }).setNegativeButton("Cerrar",(d,w) -> {}).show();
    }
    private Button collectionButton;
    private void showCatalogue() {
        catalogue=true; controllerLabel=null; LinearLayout root=hubScreen("Cine");
        LinearLayout heading=row(); heading.addView(Ui.text(this,"CINE EN CASA",14,0xFFABB3BB,true),new LinearLayout.LayoutParams(0,-2,1));
        collectionButton=Ui.compact(this,filter+"  ▾",this::chooseCollection); heading.addView(collectionButton); root.addView(heading); Ui.space(root,10);
        LinearLayout hero=Ui.column(this); heroTitle=Ui.text(this,"Tu próxima noche de cine",28,Ui.TEXT,true); heroTitle.setMaxLines(2); heroTitle.setEllipsize(android.text.TextUtils.TruncateAt.END); hero.addView(heroTitle,new LinearLayout.LayoutParams(Ui.dp(this,500),-2));
        Ui.space(hero,4); heroInfo=Ui.text(this,"",12,Ui.MUTED,false); hero.addView(heroInfo); Ui.space(hero,6);
        heroDescription=Ui.text(this,"Elige una historia de tu biblioteca.",13,Ui.TEXT,false); heroDescription.setMaxLines(1); heroDescription.setEllipsize(android.text.TextUtils.TruncateAt.END); hero.addView(heroDescription,new LinearLayout.LayoutParams(Ui.dp(this,480),-2)); Ui.space(hero,10);
        LinearLayout controls=row(); heroPlay=Ui.primary(this,"▶ Reproducir",() -> { if (featured!=null) play(featured,false); }); controls.addView(heroPlay);
        Button info=Ui.compact(this,"ⓘ Detalles",() -> { if (featured!=null) details(featured); }); LinearLayout.LayoutParams more=new LinearLayout.LayoutParams(-2,Ui.dp(this,36)); more.setMargins(Ui.dp(this,10),0,0,0); controls.addView(info,more); hero.addView(controls);
        root.addView(hero,new LinearLayout.LayoutParams(-1,Ui.dp(this,156))); Ui.space(root,10);
        LinearLayout caption=row(); caption.addView(Ui.text(this,"Tu cartelera",17,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1)); status=Ui.text(this,"",12,Ui.MUTED,false); caption.addView(status); root.addView(caption); Ui.space(root,8);
        empty=Ui.text(this,"",20,Ui.TEXT,true); empty.setGravity(Gravity.CENTER); root.addView(empty);
        grid=new GridView(this); grid.setNumColumns(6); grid.setHorizontalSpacing(Ui.dp(this,14)); grid.setVerticalSpacing(Ui.dp(this,14));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH); grid.setClipToPadding(false); grid.setPadding(4,4,4,4); grid.setSelector(android.R.color.transparent); grid.setAdapter(new Cards());
        grid.setOnItemClickListener((parent,view,position,id) -> play(visible.get(position),false));
        grid.setOnItemLongClickListener((parent,view,position,id) -> { details(visible.get(position)); return true; });
        grid.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent,View view,int position,long id) { if (position>=0 && position<visible.size()) { focusedMediaId=visible.get(position).id; feature(visible.get(position)); } }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        root.addView(grid,new LinearLayout.LayoutParams(-1,0,1)); Ui.space(root,10);
        root.addView(Ui.text(this,"OK: reproducir  ·  Mantén OK: detalles  ·  Atrás: inicio",12,Ui.MUTED,false));
        if (!library.isEmpty()) grid.requestFocus(); else collectionButton.requestFocus();
    }
    private void showHub() {
        generation++; busy=false; catalogue=false; grid=null;
        LinearLayout root=hubScreen("Inicio"); root.addView(Ui.text(this,"Tu casa. Tu guarida.",32,Ui.TEXT,true)); Ui.space(root,8);
        root.addView(Ui.text(this,"¿Qué hacemos hoy?",18,Ui.MUTED,false)); Ui.space(root,32);
        LinearLayout choices=row();
        Button cinema=Ui.feature(this,"▶ Cine","Películas y series",() -> { showCatalogue(); applyFilter(); });
        Button gaming=Ui.feature(this,"✚ Gaming","PlayStation 1 · Super Nintendo",() -> startActivity(new Intent(this,GamingActivity.class)));
        LinearLayout.LayoutParams first=new LinearLayout.LayoutParams(0,Ui.dp(this,150),1); first.setMargins(0,0,Ui.dp(this,16),0); choices.addView(cinema,first);
        choices.addView(gaming,new LinearLayout.LayoutParams(0,Ui.dp(this,150),1)); root.addView(choices); Ui.space(root,24);
        controllerLabel=Ui.text(this,Controllers.status(),13,Ui.MUTED,false); root.addView(controllerLabel);
        root.addView(new View(this),new LinearLayout.LayoutParams(1,0,1));
        root.addView(Ui.text(this,"Tu biblioteca vive en PC. Disfrútala aquí.",13,Ui.MUTED,false)); if (!library.isEmpty()) loadBackground(library.get(0)); cinema.requestFocus();
    }
    @Override public void onBackPressed() { if (catalogue && client != null) showHub(); else super.onBackPressed(); }
    private void refresh(boolean showStatus) {
        if (busy || client == null || !catalogue) return; busy = true; int request = generation; ServerClient selected = client;
        if (showStatus) status.setText("Actualizando cartelera…");
        tasks.execute(() -> {
            try {
                List<Media> fetched = selected.library(); StringBuilder fingerprint = new StringBuilder();
                for (Media item : fetched) fingerprint.append(item.id).append(item.status).append(item.title).append(item.category).append(item.description).append(item.addedBy).append(item.progress).append(item.hasPoster).append(item.posterVersion).append(item.duration);
                String next = fingerprint.toString();
                ui(() -> { if (request != generation) return; busy = false; if (!next.equals(signature)) { signature = next; library = fetched; applyFilter(); } else updateStatus(); });
            } catch (ServerClient.AccessRequired error) { ui(() -> { if (request == generation) { busy = false; askCode(selected); } }); }
            catch (Exception error) { ui(() -> { if (request == generation) { busy = false; status.setText("Sin conexión con PC. Reintentaremos automáticamente."); } }); }
        });
    }
    private Set<String> favourites() { return new HashSet<>(prefs.getStringSet("favourites:" + client.base,new HashSet<>())); }
    private long position(Media item) { return prefs.getLong("position:" + client.base + ":" + item.id,0); }
    private void applyFilter() {
        if (grid == null || client == null) return;
        int selection = Math.max(0,grid.getSelectedItemPosition()); String selectedId = focusedMediaId;
        List<Media> filtered = new ArrayList<>(); Set<String> stars = favourites(); String query = search.toLowerCase(Locale.ROOT);
        for (Media item : library) {
            if ("Favoritos".equals(filter) && !stars.contains(item.id)) continue;
            if ("Seguir viendo".equals(filter) && !(position(item) > 5000 && position(item) < Math.max(0,item.duration * 1000 - 10000))) continue;
            if (!"Todo".equals(filter) && !"Favoritos".equals(filter) && !"Seguir viendo".equals(filter) && !filter.equals(item.category)) continue;
            if ((item.title + " " + item.description + " " + item.addedBy).toLowerCase(Locale.ROOT).contains(query)) filtered.add(item);
        }
        visible = filtered; ((Cards)grid.getAdapter()).notifyDataSetChanged();
        for (int i = 0; i < visible.size(); i++) if (visible.get(i).id.equals(selectedId)) { selection = i; break; }
        if (!visible.isEmpty()) { selection=Math.min(selection,visible.size()-1); grid.setSelection(selection); feature(visible.get(selection)); }
        else { featured=null; heroPlay.setEnabled(false); heroTitle.setText("Tu próxima noche de cine"); heroInfo.setText(""); heroDescription.setText("Elige otra categoría o sube videos desde PC."); artworkKey=""; backdrop.setImageDrawable(null); }
        empty.setVisibility(visible.isEmpty() ? View.VISIBLE : View.GONE);
        empty.setText(library.isEmpty() ? "Tu primera función empieza en PC. Sube videos desde Palomita web." : "Todavía no hay historias en esta selección."); updateStatus();
    }
    private void feature(Media item) {
        featured=item; heroPlay.setEnabled("ready".equals(item.status)); heroPlay.setText(position(item)>5000 ? "▶ Continuar" : "▶ Reproducir");
        heroTitle.setText(item.title); heroInfo.setText(item.category+"  ·  "+item.length()); heroDescription.setText(item.description.isEmpty() ? "Tu cine, dentro de casa." : item.description); loadBackground(item);
    }
    private void loadBackground(Media item) {
        if (backdrop==null || client==null) return;
        String key=client.base+":"+item.id+":"+item.posterVersion;
        if (key.equals(artworkKey)) return; artworkKey=key; if (artworkDelay!=null) main.removeCallbacks(artworkDelay);
        Bitmap cached=backgrounds.get(key); backdrop.setImageBitmap(cached); backdrop.setAlpha(.78f); if (cached!=null) return;
        ServerClient selected=client; ImageView target=backdrop;
        artworkDelay=() -> tasks.execute(() -> { Bitmap image=selected.artwork(item); if (image!=null) { backgrounds.put(key,image); ui(() -> { if (target==backdrop && key.equals(artworkKey)) { target.setAlpha(0); target.setImageBitmap(image); target.animate().alpha(.78f).setDuration(220).start(); } }); } });
        main.postDelayed(artworkDelay,180);
    }
    private void updateStatus() { status.setText(visible.size() + " historias" + (search.isEmpty() ? "" : "  ·  “" + search + "”")); }
    private void updateIdentity() { if (identity != null) identity.setText(prefs.getString("user-name","") + "  ·  " + DeviceIdentity.deviceName(this)); }
    private void profile() {
        EditText name = input(prefs.getString("user-name",""),"Tu nombre",60);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("¿Quién está viendo?").setMessage("Android TV no expone nombre de usuario del sistema. Guarda tu nombre para este dispositivo.")
            .setView(name).setNegativeButton("Después",(d,w) -> {}).setPositiveButton("Guardar",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String chosen = DeviceIdentity.clean(name.getText().toString()); if (chosen.isEmpty()) { name.setError("Escribe tu nombre."); return; }
            prefs.edit().putString("user-name",chosen).apply(); updateIdentity(); dialog.dismiss();
        })); dialog.show();
    }
    private void searchDialog() {
        EditText query = input(search,"Título, descripción o persona…",160);
        new AlertDialog.Builder(this).setTitle("Encuentra tu próximo plan").setView(query).setNegativeButton("Limpiar",(d,w) -> { search = ""; applyFilter(); })
            .setPositiveButton("Buscar",(d,w) -> { search = query.getText().toString().trim(); applyFilter(); }).show();
    }
    private void toggleSelectedFavourite() {
        if (visible.isEmpty()) { toast("Escoge video de cartelera."); return; }
        for (Media item:visible) if (item.id.equals(focusedMediaId)) { toggleFavourite(item); return; }
        toggleFavourite(visible.get(Math.min(Math.max(0,grid.getSelectedItemPosition()),visible.size()-1)));
    }
    private void toggleFavourite(Media item) {
        Set<String> stars = favourites(); boolean removed = stars.remove(item.id); if (!removed) stars.add(item.id);
        prefs.edit().putStringSet("favourites:" + client.base,stars).apply(); applyFilter(); toast(removed ? "Quitado de favoritos." : "Guardado en favoritos.");
    }
    private void details(Media item) {
        new AlertDialog.Builder(this).setTitle(item.title).setMessage(item.description + "\n\n" + item.category + " · " + item.length() + " · " + item.addedBy)
            .setPositiveButton("Reproducir",(d,w) -> play(item,false)).setNeutralButton(favourites().contains(item.id) ? "Quitar favorito" : "☆ Favorito",(d,w) -> toggleFavourite(item))
            .setNegativeButton("Desde inicio",(d,w) -> play(item,true)).show();
    }
    private void play(Media item, boolean fromStart) {
        if (!"ready".equals(item.status)) { toast("processing".equals(item.status) ? "PC está preparando video: " + item.progress + "%" : "Video necesita reintento desde Palomita web."); return; }
        Intent intent = new Intent(this,PlayerActivity.class); intent.putExtra("id",item.id); intent.putExtra("fromStart",fromStart); startActivity(intent);
    }
    private final class Cards extends BaseAdapter {
        @Override public int getCount() { return visible.size(); }
        @Override public Media getItem(int position) { return visible.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View recycled, ViewGroup parent) {
            Media item = getItem(position); LinearLayout card = Ui.column(MainActivity.this); card.setPadding(Ui.dp(MainActivity.this,4),Ui.dp(MainActivity.this,4),Ui.dp(MainActivity.this,4),Ui.dp(MainActivity.this,4));
            android.graphics.drawable.StateListDrawable background = new android.graphics.drawable.StateListDrawable();
            background.addState(new int[]{android.R.attr.state_selected},Ui.panel(Ui.PANEL,Ui.LIME,MainActivity.this)); background.addState(new int[]{},Ui.panel(Ui.PANEL,Ui.PANEL,MainActivity.this)); card.setBackground(background);
            ImageView image = new ImageView(MainActivity.this); image.setScaleType(ImageView.ScaleType.CENTER_CROP); image.setBackgroundColor(Ui.BG); image.setImageResource(R.drawable.app_icon);
            card.addView(image,new LinearLayout.LayoutParams(-1,Ui.dp(MainActivity.this,124)));
            TextView title = Ui.text(MainActivity.this,(favourites().contains(item.id) ? "♥  " : "") + item.title,13,Ui.TEXT,true); title.setMaxLines(1); title.setEllipsize(android.text.TextUtils.TruncateAt.END); card.addView(title);
            card.addView(Ui.text(MainActivity.this,item.length(),11,Ui.MUTED,false)); long time = position(item);
            String caption = "ready".equals(item.status) ? time > 5000 && time < Math.max(0,item.duration * 1000 - 10000) ? "Seguir desde " + (time / 60000) + " min" : item.addedBy : "processing".equals(item.status) ? "Preparando " + item.progress + "%" : "Revisar desde web";
            if (time>5000 && "ready".equals(item.status)) { TextView foot=Ui.text(MainActivity.this,"▶ "+time/60000+" min",10,Ui.LIME,false); foot.setMaxLines(1); card.addView(foot); }
            card.setLayoutParams(new AbsListView.LayoutParams(-1,Ui.dp(MainActivity.this,184))); card.setFocusable(false); card.setContentDescription(item.title + ", " + item.category + ", " + caption);
            if (item.hasPoster) {
                ServerClient selected = client; String key = selected.base + ":" + item.id + ":" + item.posterVersion; Bitmap cached = posters.get(key); image.setTag(key);
                if (cached != null) image.setImageBitmap(cached);
                else tasks.execute(() -> {
                    Bitmap bitmap = posters.get(key); if (bitmap == null) try { bitmap = selected.poster(item.id); } catch (Exception ignored) { }
                    if (bitmap != null) { posters.put(key,bitmap); Bitmap result = bitmap; ui(() -> { if (key.equals(image.getTag())) image.setImageBitmap(result); }); }
                });
            }
            return card;
        }
    }
}
