package com.andress1014.casacine.tv;

import android.app.Activity;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.util.*;

/** A content-first home, navigable with a TV remote. Uses the user's real library. */
final class HomeScreen {
    interface Listener {
        void play(Media media);
        void details(Media media);
        void cinema();
        void gaming();
        long position(Media media);
        void artwork(Media media, ImageView target, boolean wide);
        void feature(Media media);
    }
    private final Activity activity;
    private final Listener listener;
    private final List<Media> library;
    private final ScrollView scroll;
    private final LinearLayout body;
    private final Map<String,View> cards = new LinkedHashMap<>();
    private Set<String> favourites;
    private Button primary;

    HomeScreen(Activity activity, LinearLayout root, List<Media> library, Set<String> favourites, Listener listener) {
        this.activity=activity; this.library=new ArrayList<>(library); this.favourites=new HashSet<>(favourites); this.listener=listener;
        root.setPadding(0,0,0,0);
        scroll=new ScrollView(activity); scroll.setVerticalScrollBarEnabled(false); scroll.setFillViewport(true);
        scroll.setFocusable(false); scroll.setClipToPadding(false);
        body=Ui.column(activity); body.setPadding(dp(40),dp(6),dp(40),dp(28)); body.setClipChildren(false);
        scroll.addView(body,new ScrollView.LayoutParams(-1,-2)); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        build(); primary.requestFocus();
    }
    void refresh(Set<String> favourites) {
        View focus=body.findFocus(); String key=focus!=null && focus.getTag() instanceof String ? (String)focus.getTag() : null;
        int offset=scroll.getScrollY(); this.favourites=new HashSet<>(favourites);
        build();
        View restore=key==null ? null : cards.get(key);
        if (restore!=null) restore.requestFocus(); else if (key!=null) primary.requestFocus();
        scroll.post(() -> scroll.scrollTo(0,offset));
    }
    private int dp(int value) { return Ui.dp(activity,value); }
    private boolean continuing(Media media) {
        long position=listener.position(media);
        return position>5000 && position<Math.max(0,(long)(media.duration*1000)-10000);
    }
    private void build() {
        body.removeAllViews(); cards.clear();
        List<Media> ready=new ArrayList<>(), watching=new ArrayList<>(), saved=new ArrayList<>();
        for (Media media:library) if ("ready".equals(media.status)) {
            ready.add(media); if (continuing(media)) watching.add(media); if (favourites.contains(media.id)) saved.add(media);
        }
        Media featured=!watching.isEmpty() ? watching.get(0) : ready.isEmpty() ? null : ready.get(0);
        hero(featured);
        if (!watching.isEmpty()) shelf("Seguir viendo",watching,true,8);
        if (!ready.isEmpty()) shelf("En tu guarida",ready,false,12);
        if (!saved.isEmpty()) shelf("Tus favoritos",saved,false,10);
        gaming();
    }
    private void hero(Media media) {
        LinearLayout hero=Ui.column(activity); hero.setMinimumHeight(dp(230)); hero.setPadding(0,dp(12),0,dp(20));
        TextView label=Ui.text(activity,media==null ? "BIENVENIDO A TU GUARIDA" : continuing(media) ? "TU HISTORIA CONTINÚA" : "HOY, EN TU GUARIDA",11,Ui.LIME,true);
        label.setLetterSpacing(.16f); hero.addView(label); Ui.space(hero,10);
        int width=activity.getResources().getConfiguration().screenWidthDp;
        int textWidth=dp(Math.min(510,width>0 ? width-80 : 510));
        TextView title=Ui.text(activity,media==null ? "Tu próxima gran historia." : media.title,38,Ui.TEXT,true);
        title.setTypeface(Typeface.create("sans-serif-black",Typeface.NORMAL)); title.setMaxLines(2); title.setEllipsize(TextUtils.TruncateAt.END);
        title.setLetterSpacing(-.035f); title.setLineSpacing(0,.98f); hero.addView(title,new LinearLayout.LayoutParams(textWidth,-2)); Ui.space(hero,8);
        if (media!=null) {
            TextView meta=Ui.text(activity,media.category+"  ·  "+media.length()+"  ·  Tu biblioteca",12,Ui.MUTED,false); hero.addView(meta); Ui.space(hero,8);
        }
        String description=media==null ? "Películas, series y clásicos para jugar. Todo lo que te gusta, en un mismo lugar."
            : media.description.isEmpty() ? "Prepara tu lugar favorito. Esta historia ya es parte de tu guarida." : media.description;
        TextView summary=Ui.text(activity,description,13,0xFFD0D3DA,false); summary.setMaxLines(2); summary.setEllipsize(TextUtils.TruncateAt.END);
        hero.addView(summary,new LinearLayout.LayoutParams(dp(Math.min(460,width>0 ? width-80 : 460)),-2)); Ui.space(hero,14);
        LinearLayout controls=new LinearLayout(activity); controls.setGravity(Gravity.CENTER_VERTICAL);
        primary=Ui.primary(activity,media==null ? "Explorar Cine" : continuing(media) ? "▶  Continuar" : "▶  Reproducir",() -> { if (media==null) listener.cinema(); else listener.play(media); });
        primary.setId(View.generateViewId()); primary.setTag("hero"); cards.put("hero",primary); primary.setTextSize(14);
        controls.addView(primary,new LinearLayout.LayoutParams(-2,dp(40)));
        if (media!=null) {
            Button details=Ui.button(activity,"Más información",() -> listener.details(media)); details.setTextSize(13);
            details.setTag("details"); cards.put("details",details);
            details.setMinHeight(0); details.setMinimumHeight(0); details.setPadding(dp(18),0,dp(18),0);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-2,dp(40)); size.setMargins(dp(12),0,0,0); controls.addView(details,size);
            listener.feature(media);
        }
        hero.addView(controls); body.addView(hero);
    }
    private void shelf(String title,List<Media> media,boolean wide,int limit) {
        boolean firstShelf=body.getChildCount()==1;
        LinearLayout heading=new LinearLayout(activity); heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(Ui.text(activity,title,18,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        Button all=Ui.compact(activity,"Ver todo  →",listener::cinema); all.setContentDescription("Ver toda biblioteca de Cine"); heading.addView(all);
        body.addView(heading); Ui.space(body,4);
        LinearLayout row=new LinearLayout(activity); row.setPadding(dp(4),dp(6),dp(4),dp(8)); row.setClipChildren(false);
        HorizontalScrollView rail=Ui.scrollRow(row); rail.setFocusable(false); rail.setClipToPadding(false); rail.setClipChildren(false);
        for (int i=0;i<Math.min(media.size(),limit);i++) {
            View card=card(title,media.get(i),wide,firstShelf);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(dp(wide ? 232 : 122),-2); size.setMargins(0,0,dp(10),0); row.addView(card,size);
        }
        body.addView(rail,new LinearLayout.LayoutParams(-1,-2)); Ui.space(body,14);
    }
    private View card(String shelf,Media media,boolean wide,boolean firstShelf) {
        LinearLayout card=Ui.column(activity); card.setPadding(dp(4),dp(4),dp(4),dp(6)); card.setBackground(cardFocus());
        card.setId(View.generateViewId()); card.setFocusable(true); card.setClickable(true); if (firstShelf) card.setNextFocusUpId(primary.getId());
        String key=shelf+":"+media.id; card.setTag(key); cards.put(key,card);
        card.setOnClickListener(v -> listener.play(media)); card.setOnLongClickListener(v -> { listener.details(media); return true; });
        card.setOnFocusChangeListener((v,focused) -> v.animate().scaleX(focused ? 1.035f : 1).scaleY(focused ? 1.035f : 1).setDuration(130).start());
        FrameLayout frame=new FrameLayout(activity); frame.setBackground(Ui.panel(Ui.PANEL,0x00000000,activity)); frame.setClipToOutline(true);
        ImageView cover=new ImageView(activity); cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        frame.addView(cover,new FrameLayout.LayoutParams(-1,-1));
        if (media.hasPoster || wide && media.hasBackdrop) listener.artwork(media,cover,wide);
        else { cover.setImageResource(R.drawable.app_icon); cover.setScaleType(ImageView.ScaleType.CENTER_INSIDE); cover.setPadding(dp(22),dp(22),dp(22),dp(22)); }
        if (wide) {
            ProgressBar progress=new ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal);
            progress.setMax(1000); progress.setProgress((int)Math.min(1000,listener.position(media)/Math.max(1,media.duration)));
            progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Ui.LIME)); progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF4A4F59));
            FrameLayout.LayoutParams bar=new FrameLayout.LayoutParams(-1,dp(4),Gravity.BOTTOM); frame.addView(progress,bar);
        }
        card.addView(frame,new LinearLayout.LayoutParams(-1,dp(wide ? 126 : 160))); Ui.space(card,7);
        TextView name=Ui.text(activity,media.title,12,Ui.TEXT,true); name.setMaxLines(1); name.setEllipsize(TextUtils.TruncateAt.END); card.addView(name);
        long remaining=Math.max(0,(long)(media.duration/60)-listener.position(media)/60000);
        TextView subtitle=Ui.text(activity,wide ? "Quedan "+remaining+" min" : media.length(),10,Ui.MUTED,false); card.addView(subtitle);
        card.setContentDescription(media.title+", "+media.category+", "+media.length()+(wide ? ", continuar desde "+listener.position(media)/60000+" minutos" : ""));
        return card;
    }
    private StateListDrawable cardFocus() {
        StateListDrawable background=new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_focused},Ui.panel(0xFF1C222D,Ui.LIME,activity));
        background.addState(new int[]{},Ui.panel(0x00000000,0x00000000,activity)); return background;
    }
    private void gaming() {
        Ui.space(body,4);
        FrameLayout tile=new FrameLayout(activity); tile.setBackground(cardFocus()); tile.setClipToOutline(true); tile.setFocusable(true); tile.setClickable(true);
        tile.setId(View.generateViewId()); tile.setTag("gaming"); cards.put("gaming",tile); tile.setOnClickListener(v -> listener.gaming());
        tile.setContentDescription("Guarida Play. Entrar a Gaming: PlayStation 1 y Super Nintendo.");
        ImageView art=new ImageView(activity); art.setImageResource(R.drawable.gaming_backdrop); art.setScaleType(ImageView.ScaleType.CENTER_CROP); art.setAlpha(.65f); tile.addView(art,new FrameLayout.LayoutParams(-1,-1));
        View shade=new View(activity); shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{0xF20C101A,0xB0121420,0x40121420})); tile.addView(shade,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout copy=Ui.column(activity); copy.setPadding(dp(26),dp(18),dp(24),dp(18));
        TextView eyebrow=Ui.text(activity,"GUARIDA PLAY",10,Ui.LIME,true); eyebrow.setLetterSpacing(.16f); copy.addView(eyebrow); Ui.space(copy,5);
        copy.addView(Ui.text(activity,"Tu siguiente aventura.",24,Ui.TEXT,true)); Ui.space(copy,4);
        copy.addView(Ui.text(activity,"PlayStation 1  ·  Super Nintendo",12,0xFFD0D3DA,false));
        tile.addView(copy,new FrameLayout.LayoutParams(-1,-1));
        TextView action=Ui.text(activity,"Explorar Gaming  →",13,Ui.TEXT,true); action.setPadding(dp(16),dp(10),dp(16),dp(10)); action.setBackground(Ui.panel(0xCC171D27,0x667C8798,activity));
        FrameLayout.LayoutParams position=new FrameLayout.LayoutParams(-2,-2,Gravity.END|Gravity.CENTER_VERTICAL); position.setMargins(0,0,dp(28),0); tile.addView(action,position);
        StateListDrawable outline=new StateListDrawable(); outline.addState(new int[]{android.R.attr.state_focused},Ui.panel(0x00000000,Ui.LIME,activity)); outline.addState(new int[]{},Ui.panel(0x00000000,0xFF303747,activity));
        View border=new View(activity); border.setBackground(outline); border.setDuplicateParentStateEnabled(true); tile.addView(border,new FrameLayout.LayoutParams(-1,-1));
        body.addView(tile,new LinearLayout.LayoutParams(-1,dp(126)));
    }
}
