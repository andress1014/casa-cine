package com.andress1014.casacine.tv;
import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.LayerDrawable;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ImageButton;

public final class Ui {
    public static final int BG = Color.rgb(16,21,16), PANEL = Color.rgb(32,43,25), LIME = Color.rgb(216,252,112);
    public static final int TEXT = Color.rgb(239,244,226), MUTED = Color.rgb(163,181,141);
    private Ui() {}
    public static int dp(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    public static GradientDrawable panel(int color, int stroke, Context context) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(context,10));
        shape.setStroke(dp(context,2),stroke); return shape;
    }
    public static StateListDrawable focus(Context context) {
        StateListDrawable selector = new StateListDrawable();
        selector.addState(new int[]{android.R.attr.state_focused},panel(LIME,LIME,context));
        selector.addState(new int[]{android.R.attr.state_selected},panel(Color.rgb(50,68,31),Color.rgb(111,144,74),context));
        selector.addState(new int[]{},panel(Color.argb(145,32,43,25),Color.TRANSPARENT,context)); return selector;
    }
    public static TextView text(Context context, String label, int size, int color, boolean bold) {
        TextView view = new TextView(context); view.setText(label); view.setTextSize(size); view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT,Typeface.BOLD); return view;
    }
    public static TextView version(Context context) {
        TextView label = text(context,"Guarida TV · v" + BuildConfig.VERSION_NAME,12,MUTED,false);
        label.setGravity(Gravity.END); label.setSingleLine(true); return label;
    }
    public static Button button(Context context, String label, Runnable action) {
        Button button = new Button(context); button.setText(label); button.setTextSize(14); button.setAllCaps(false);
        button.setMinHeight(dp(context,46)); button.setMinimumWidth(0); button.setPadding(dp(context,18),dp(context,9),dp(context,18),dp(context,9));
        button.setBackground(focus(context)); button.setTextColor(new ColorStateList(new int[][]{new int[]{android.R.attr.state_focused},new int[]{}},new int[]{BG,TEXT}));
        button.setFocusable(true); button.setOnClickListener(view -> action.run()); return button;
    }
    public static LinearLayout column(Context context) { LinearLayout layout = new LinearLayout(context); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    public static HorizontalScrollView scrollRow(LinearLayout row) {
        HorizontalScrollView scroll=new HorizontalScrollView(row.getContext()); scroll.setHorizontalScrollBarEnabled(false); scroll.addView(row); return scroll;
    }
    public static void space(LinearLayout parent, int height) { View view = new View(parent.getContext()); parent.addView(view,new LinearLayout.LayoutParams(1,dp(parent.getContext(),height))); }
    public static final class TvShell {
        public final LinearLayout content;
        public final TextView identity;
        public final ImageView backdrop;
        private TvShell(LinearLayout content, TextView identity,ImageView backdrop) { this.content=content; this.identity=identity; this.backdrop=backdrop; }
    }
    public static TvShell shell(Activity activity,String section,String profile,Runnable home,Runnable cinema,Runnable gaming,Runnable search,Runnable options,Runnable editProfile) {
        FrameLayout canvas=new FrameLayout(activity); canvas.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{Color.rgb(25,42,37),BG,Color.rgb(24,22,37)}));
        if (section.equals("Gaming")) {
            ImageView ambience=new ImageView(activity); ambience.setScaleType(ImageView.ScaleType.CENTER_CROP); ambience.setImageResource(R.drawable.gaming_backdrop); canvas.addView(ambience,new FrameLayout.LayoutParams(-1,-1));
        }
        ImageView backdrop=new ImageView(activity); backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP); backdrop.setAlpha(.78f); canvas.addView(backdrop,new FrameLayout.LayoutParams(-1,-1));
        boolean arcade=section.equals("Gaming");
        View shade=new View(activity); shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,arcade ? new int[]{0xEE091019,0x76091019,0x10091019} : new int[]{0xFA101510,0xAD101510,0x25101510})); canvas.addView(shade,new FrameLayout.LayoutParams(-1,-1));
        View bottom=new View(activity); bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,arcade ? new int[]{0x00090D15,0x66090D15,0xFF090D15} : new int[]{0x00101510,0xA0101510,BG})); canvas.addView(bottom,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout root=column(activity); canvas.addView(root,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(activity); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(activity,28),0,dp(activity,28),0);
        header.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xC9091014,0x00091014}));
        header.addView(text(activity,"guarida.",23,LIME,true),new LinearLayout.LayoutParams(dp(activity,142),-2));
        nav(header,"Inicio",section.equals("Inicio"),home); nav(header,"Cine",section.equals("Cine"),cinema); nav(header,"Gaming",section.equals("Gaming"),gaming);
        header.addView(new View(activity),new LinearLayout.LayoutParams(0,1,1));
        header.addView(icon(activity,"search","Buscar",search),new LinearLayout.LayoutParams(dp(activity,42),dp(activity,42)));
        header.addView(icon(activity,"settings","Opciones",options),new LinearLayout.LayoutParams(dp(activity,42),dp(activity,42)));
        Button avatar=button(activity,"TV",editProfile); avatar.setTextSize(13); avatar.setPadding(0,0,0,0); avatar.setMinHeight(0); avatar.setMinimumHeight(0);
        StateListDrawable circle=new StateListDrawable(); circle.addState(new int[]{android.R.attr.state_focused},circle(LIME,LIME,activity)); circle.addState(new int[]{},circle(0xCC33424A,Color.TRANSPARENT,activity)); avatar.setBackground(circle);
        LinearLayout.LayoutParams avatarSize=new LinearLayout.LayoutParams(dp(activity,34),dp(activity,34)); avatarSize.setMargins(dp(activity,14),0,dp(activity,10),0); header.addView(avatar,avatarSize);
        TextView identity=text(activity,"",10,0xFFABB3BB,false); identity.setMaxLines(1); identity.setEllipsize(android.text.TextUtils.TruncateAt.END);
        identity.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after) { }
            @Override public void onTextChanged(CharSequence s,int start,int before,int count) { }
            @Override public void afterTextChanged(Editable text) { String value=text.toString().trim(); avatar.setText(value.isEmpty() || value.startsWith("·") ? "TV" : new String(Character.toChars(value.codePointAt(0))).toUpperCase(java.util.Locale.ROOT)); avatar.setContentDescription("Perfil: "+value); }
        }); identity.setText(profile); identity.setOnClickListener(v -> editProfile.run()); header.addView(identity,new LinearLayout.LayoutParams(dp(activity,118),-2));
        root.addView(header,new LinearLayout.LayoutParams(-1,dp(activity,64)));
        LinearLayout content=column(activity); content.setPadding(dp(activity,40),dp(activity,8),dp(activity,40),dp(activity,16));
        root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        TextView version=version(activity); version.setPadding(dp(activity,40),0,dp(activity,40),dp(activity,12));
        root.addView(version,new LinearLayout.LayoutParams(-1,-2));
        activity.setContentView(canvas); return new TvShell(content,identity,backdrop);
    }
    private static void nav(LinearLayout header,String title,boolean selected,Runnable action) {
        Context context=header.getContext(); Button button=button(context,title,action); button.setPadding(0,0,0,0); button.setMinHeight(0); button.setMinimumHeight(0); button.setTextSize(14);
        StateListDrawable state=new StateListDrawable(); state.addState(new int[]{android.R.attr.state_focused},panel(TEXT,Color.TRANSPARENT,context));
        GradientDrawable line=new GradientDrawable(); line.setColor(LIME); line.setCornerRadius(dp(context,1)); LayerDrawable underline=new LayerDrawable(new android.graphics.drawable.Drawable[]{new ColorDrawable(Color.TRANSPARENT),line}); underline.setLayerInset(1,dp(context,18),dp(context,39),dp(context,18),dp(context,2));
        state.addState(new int[]{android.R.attr.state_selected},underline); state.addState(new int[]{},new ColorDrawable(Color.TRANSPARENT)); button.setBackground(state); button.setSelected(selected);
        LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(dp(context,82),dp(context,44)); size.setMargins(0,0,dp(context,6),0); header.addView(button,size);
    }
    private static GradientDrawable circle(int fill,int stroke,Context context) { GradientDrawable shape=new GradientDrawable(); shape.setShape(GradientDrawable.OVAL); shape.setColor(fill); shape.setStroke(dp(context,2),stroke); return shape; }
    private static ImageButton icon(Context context,String kind,String label,Runnable action) {
        ImageButton button=new ImageButton(context); button.setImageDrawable(new NavIcon(kind,TEXT)); button.setScaleType(ImageView.ScaleType.FIT_CENTER); button.setPadding(dp(context,10),dp(context,10),dp(context,10),dp(context,10));
        StateListDrawable state=new StateListDrawable(); state.addState(new int[]{android.R.attr.state_focused},circle(0x5533444A,TEXT,context)); state.addState(new int[]{},new ColorDrawable(Color.TRANSPARENT)); button.setBackground(state); button.setFocusable(true); button.setContentDescription(label); button.setOnClickListener(v -> action.run()); return button;
    }
    public static Button feature(Context context,String title,String subtitle,Runnable action) {
        Button button=button(context,title+"\n"+subtitle,action); button.setTextSize(20); button.setGravity(Gravity.CENTER);
        StateListDrawable state=new StateListDrawable(); state.addState(new int[]{android.R.attr.state_focused},panel(LIME,LIME,context));
        GradientDrawable tile=new GradientDrawable(GradientDrawable.Orientation.TL_BR,title.contains("Cine") ? new int[]{0xD5194739,0xDC11232C} : new int[]{0xD5362848,0xDC243049}); tile.setCornerRadius(dp(context,12));
        state.addState(new int[]{},tile); button.setBackground(state);
        button.setSingleLine(false); button.setMinHeight(dp(context,150)); return button;
    }
    public static Button compact(Context context,String title,Runnable action) {
        Button button=button(context,title,action); button.setTextSize(12); button.setMinHeight(0); button.setMinimumHeight(0); button.setPadding(dp(context,16),dp(context,5),dp(context,16),dp(context,5));
        StateListDrawable state=new StateListDrawable(); state.addState(new int[]{android.R.attr.state_focused},panel(TEXT,Color.TRANSPARENT,context)); state.addState(new int[]{},new ColorDrawable(Color.TRANSPARENT)); button.setBackground(state);
        button.setLayoutParams(new LinearLayout.LayoutParams(-2,dp(context,36))); return button;
    }
    public static Button primary(Context context,String title,Runnable action) {
        Button button=compact(context,title,action); StateListDrawable state=new StateListDrawable();
        GradientDrawable focused=panel(LIME,Color.TRANSPARENT,context),normal=panel(TEXT,Color.TRANSPARENT,context); focused.setCornerRadius(dp(context,5)); normal.setCornerRadius(dp(context,5));
        state.addState(new int[]{android.R.attr.state_focused},focused); state.addState(new int[]{},normal);
        button.setBackground(state); button.setTextColor(BG); button.setTypeface(Typeface.DEFAULT,Typeface.BOLD); return button;
    }
    public static FrameLayout gamePlaceholder(Context context,String system) {
        FrameLayout artwork=new FrameLayout(context);
        ImageView illustration=new ImageView(context); illustration.setScaleType(ImageView.ScaleType.CENTER_CROP); illustration.setImageResource(R.drawable.gaming_backdrop); artwork.addView(illustration,new FrameLayout.LayoutParams(-1,-1));
        View tint=new View(context); tint.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,system.equals("psx") ? new int[]{0x30133761,0x80102835} : new int[]{0x403F1B65,0x80572D4C})); artwork.addView(tint,new FrameLayout.LayoutParams(-1,-1));
        TextView console=text(context,system.equals("psx") ? "PS1" : "SNES",10,TEXT,true); console.setPadding(dp(context,7),dp(context,3),dp(context,7),dp(context,3)); console.setBackground(panel(0xCC101722,Color.TRANSPARENT,context));
        FrameLayout.LayoutParams badge=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.START); badge.setMargins(dp(context,6),0,0,dp(context,6)); artwork.addView(console,badge); return artwork;
    }
}
