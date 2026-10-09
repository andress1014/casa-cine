package com.andress1014.casacine.tv;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

/** Small vector icons stay sharp on TV without depending on font glyphs. */
public final class NavIcon extends Drawable {
    private final String kind;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    public NavIcon(String kind,int color) { this.kind=kind; paint.setColor(color); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1.8f); paint.setStrokeCap(Paint.Cap.ROUND); }
    @Override public void draw(Canvas canvas) {
        Rect bounds=getBounds(); int save=canvas.save(); canvas.translate(bounds.left,bounds.top); canvas.scale(bounds.width()/24f,bounds.height()/24f);
        if (kind.equals("search")) { canvas.drawCircle(10.5f,10.5f,6.3f,paint); canvas.drawLine(15.1f,15.1f,20,20,paint); }
        else {
            canvas.drawCircle(12,12,5.6f,paint); canvas.drawCircle(12,12,2.2f,paint);
            for (int i=0;i<8;i++) { double angle=i*Math.PI/4; canvas.drawLine(12+(float)Math.cos(angle)*6,12+(float)Math.sin(angle)*6,12+(float)Math.cos(angle)*8.5f,12+(float)Math.sin(angle)*8.5f,paint); }
        }
        canvas.restoreToCount(save);
    }
    @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
    @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
