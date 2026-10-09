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

public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService tasks = Executors.newFixedThreadPool(4);
    private final LruCache<String, Bitmap> posters = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getByteCount(); }
    };
    private SharedPreferences prefs;
    private ServerClient client;
    private List<Media> library = new ArrayList<>(), visible = new ArrayList<>();
    private String filter = "Todo", search = "", signature = "";
    private GridView grid;
    private TextView status, empty, identity;
    private LinearLayout results;
    private EditText address;
    private boolean busy, resumed, catalogue, loginVisible, discovering;
    private int generation;
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (resumed && catalogue) refresh(false); if (resumed) main.postDelayed(this,6000); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs = getSharedPreferences("casacine",MODE_PRIVATE);
        String saved = prefs.getString("server",""); showConnection();
        if (saved != null && !saved.isEmpty()) connect(saved); else discover();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; main.removeCallbacks(poll); main.post(poll); if (catalogue) { updateIdentity(); applyFilter(); } }
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
        generation++; catalogue = false; busy = false; client = null; grid = null; identity = null; library.clear(); visible.clear(); signature = "";
        LinearLayout root = screen(); root.addView(Ui.text(this,"casacine.  ▶",44,Ui.LIME,true)); Ui.space(root,14);
        root.addView(Ui.text(this,"Tu casa tiene pantalla grande",27,Ui.TEXT,true)); Ui.space(root,12);
        root.addView(Ui.text(this,"Enciende CasaCine en PC. Conecta TV al mismo Wi-Fi.",18,Ui.MUTED,false)); Ui.space(root,16);
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
        if (discovering) return; discovering = true; int request = generation; status.setText("Buscando CasaCine en Wi-Fi…");
        tasks.execute(() -> { List<String> servers = ServerClient.discover(); ui(() -> {
            discovering = false; if (request != generation || catalogue) return; results.removeAllViews();
            if (servers.size() == 1) { address.setText(servers.get(0)); connect(servers.get(0)); }
            else if (servers.isEmpty()) status.setText("Sin detección automática. Escribe IP que muestra CasaCine en PC.");
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
                    showCatalogue(); applyFilter(); if (prefs.getString("user-name","").isEmpty()) profile(); });
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
    private void showCatalogue() {
        catalogue = true; LinearLayout root = screen(); LinearLayout heading = row();
        heading.addView(Ui.text(this,"casacine.  ▶",32,Ui.LIME,true),new LinearLayout.LayoutParams(0,-2,1));
        identity = Ui.text(this,"",14,Ui.MUTED,false); heading.addView(identity); root.addView(heading); updateIdentity(); Ui.space(root,10);
        LinearLayout actions = row(); button(actions,"Buscar",this::searchDialog); button(actions,"Actualizar",() -> refresh(true));
        button(actions,"☆ Favorito",this::toggleSelectedFavourite); button(actions,"Mi perfil",this::profile); button(actions,"Otra PC",this::showConnection); root.addView(actions); Ui.space(root,10);
        HorizontalScrollView tabs = new HorizontalScrollView(this); tabs.setHorizontalScrollBarEnabled(false); LinearLayout choices = row();
        for (String collection : new String[]{"Todo","Películas","Series","En familia","Recuerdos","Otros","Favoritos","Seguir viendo"}) button(choices,collection,() -> { filter = collection; applyFilter(); });
        tabs.addView(choices); root.addView(tabs); Ui.space(root,8); status = Ui.text(this,"",14,Ui.MUTED,false); root.addView(status); Ui.space(root,8);
        empty = Ui.text(this,"",22,Ui.TEXT,true); empty.setGravity(Gravity.CENTER); root.addView(empty);
        grid = new GridView(this); grid.setNumColumns(3); grid.setHorizontalSpacing(Ui.dp(this,14)); grid.setVerticalSpacing(Ui.dp(this,14));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH); grid.setClipToPadding(false); grid.setPadding(4,4,4,4); grid.setSelector(android.R.color.transparent); grid.setAdapter(new Cards());
        grid.setOnItemClickListener((parent,view,position,id) -> play(visible.get(position),false));
        grid.setOnItemLongClickListener((parent,view,position,id) -> { details(visible.get(position)); return true; });
        root.addView(grid,new LinearLayout.LayoutParams(-1,0,1)); Ui.space(root,8);
        root.addView(Ui.text(this,"Flechas: explorar   •   OK: reproducir   •   Mantén OK: detalles   •   Atrás: volver",13,Ui.MUTED,false));
        if (!library.isEmpty()) grid.requestFocus(); else actions.getChildAt(0).requestFocus();
    }
    private void refresh(boolean showStatus) {
        if (busy || client == null || !catalogue) return; busy = true; int request = generation; ServerClient selected = client;
        if (showStatus) status.setText("Actualizando cartelera…");
        tasks.execute(() -> {
            try {
                List<Media> fetched = selected.library(); StringBuilder fingerprint = new StringBuilder();
                for (Media item : fetched) fingerprint.append(item.id).append(item.status).append(item.title).append(item.category).append(item.description).append(item.addedBy).append(item.progress).append(item.hasPoster).append(item.duration);
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
        int selection = Math.max(0,grid.getSelectedItemPosition()); String selectedId = selection < visible.size() ? visible.get(selection).id : "";
        List<Media> filtered = new ArrayList<>(); Set<String> stars = favourites(); String query = search.toLowerCase(Locale.ROOT);
        for (Media item : library) {
            if ("Favoritos".equals(filter) && !stars.contains(item.id)) continue;
            if ("Seguir viendo".equals(filter) && !(position(item) > 5000 && position(item) < item.duration * 950)) continue;
            if (!"Todo".equals(filter) && !"Favoritos".equals(filter) && !"Seguir viendo".equals(filter) && !filter.equals(item.category)) continue;
            if ((item.title + " " + item.description + " " + item.addedBy).toLowerCase(Locale.ROOT).contains(query)) filtered.add(item);
        }
        visible = filtered; ((Cards)grid.getAdapter()).notifyDataSetChanged();
        for (int i = 0; i < visible.size(); i++) if (visible.get(i).id.equals(selectedId)) { selection = i; break; }
        if (!visible.isEmpty()) grid.setSelection(Math.min(selection,visible.size()-1));
        empty.setVisibility(visible.isEmpty() ? View.VISIBLE : View.GONE);
        empty.setText(library.isEmpty() ? "Tu primera función empieza en PC. Sube videos desde CasaCine web." : "Todavía no hay historias en esta selección."); updateStatus();
    }
    private void updateStatus() { status.setText(filter + "  ·  " + visible.size() + " historias" + (search.isEmpty() ? "" : "  ·  “" + search + "”") + "  ·  " + client.base); }
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
        if (!"ready".equals(item.status)) { toast("processing".equals(item.status) ? "PC está preparando video: " + item.progress + "%" : "Video necesita reintento desde CasaCine web."); return; }
        Intent intent = new Intent(this,PlayerActivity.class); intent.putExtra("id",item.id); intent.putExtra("fromStart",fromStart); startActivity(intent);
    }
    private final class Cards extends BaseAdapter {
        @Override public int getCount() { return visible.size(); }
        @Override public Media getItem(int position) { return visible.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View recycled, ViewGroup parent) {
            Media item = getItem(position); LinearLayout card = Ui.column(MainActivity.this); int pad = Ui.dp(MainActivity.this,8); card.setPadding(pad,pad,pad,pad);
            android.graphics.drawable.StateListDrawable background = new android.graphics.drawable.StateListDrawable();
            background.addState(new int[]{android.R.attr.state_selected},Ui.panel(Ui.PANEL,Ui.LIME,MainActivity.this)); background.addState(new int[]{},Ui.panel(Ui.PANEL,Ui.PANEL,MainActivity.this)); card.setBackground(background);
            ImageView image = new ImageView(MainActivity.this); image.setScaleType(ImageView.ScaleType.CENTER_CROP); image.setBackgroundColor(Ui.BG); image.setImageResource(R.drawable.app_icon);
            card.addView(image,new LinearLayout.LayoutParams(-1,Ui.dp(MainActivity.this,120)));
            TextView title = Ui.text(MainActivity.this,(favourites().contains(item.id) ? "♥  " : "") + item.title,17,Ui.TEXT,true); title.setMaxLines(1); title.setEllipsize(android.text.TextUtils.TruncateAt.END); card.addView(title);
            card.addView(Ui.text(MainActivity.this,item.category + " · " + item.length(),13,Ui.MUTED,false)); long time = position(item);
            String caption = "ready".equals(item.status) ? time > 5000 && time < item.duration * 950 ? "Seguir desde " + (time / 60000) + " min" : item.addedBy : "processing".equals(item.status) ? "Preparando " + item.progress + "%" : "Revisar desde web";
            TextView foot = Ui.text(MainActivity.this,caption,12,Ui.MUTED,false); foot.setMaxLines(1); card.addView(foot);
            card.setLayoutParams(new AbsListView.LayoutParams(-1,Ui.dp(MainActivity.this,194))); card.setFocusable(false); card.setContentDescription(item.title + ", " + item.category + ", " + caption);
            if (item.hasPoster) {
                ServerClient selected = client; String key = selected.base + ":" + item.id; Bitmap cached = posters.get(key); image.setTag(key);
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
