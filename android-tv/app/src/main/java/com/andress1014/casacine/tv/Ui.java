package com.andress1014.casacine.tv;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

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
        selector.addState(new int[]{},panel(PANEL,Color.rgb(61,79,43),context)); return selector;
    }
    public static TextView text(Context context, String label, int size, int color, boolean bold) {
        TextView view = new TextView(context); view.setText(label); view.setTextSize(size); view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT,Typeface.BOLD); return view;
    }
    public static Button button(Context context, String label, Runnable action) {
        Button button = new Button(context); button.setText(label); button.setTextSize(14); button.setAllCaps(false);
        button.setMinHeight(dp(context,46)); button.setMinimumWidth(0); button.setPadding(dp(context,18),dp(context,9),dp(context,18),dp(context,9));
        button.setBackground(focus(context)); button.setTextColor(new ColorStateList(new int[][]{new int[]{android.R.attr.state_focused},new int[]{}},new int[]{BG,TEXT}));
        button.setFocusable(true); button.setOnClickListener(view -> action.run()); return button;
    }
    public static LinearLayout column(Context context) { LinearLayout layout = new LinearLayout(context); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    public static void space(LinearLayout parent, int height) { View view = new View(parent.getContext()); parent.addView(view,new LinearLayout.LayoutParams(1,dp(parent.getContext(),height))); }
}
