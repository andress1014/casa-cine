package com.andress1014.casacine.tv;

import android.app.Activity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={23,28,35},qualifiers="w960dp-h540dp-land-mdpi")
public class HomeScreenTest {
    private final List<String> calls=new ArrayList<>();
    private final Map<String,Long> positions=new HashMap<>();
    private Activity activity;
    private View canvas;
    private HomeScreen home;
    private Media movie(String id,String title) {
        Media m=new Media(); m.id=id; m.title=title; m.description="Una historia de tu biblioteca.";
        m.status="ready"; m.category="Películas"; m.duration=7200; m.addedBy="Casa"; return m;
    }
    private void create(List<Media> library) {
        activity=Robolectric.buildActivity(Activity.class).setup().get();
        Ui.TvShell shell=Ui.shell(activity,"Inicio","TV",() -> {},() -> {},() -> {},() -> {},() -> {},() -> {});
        home=new HomeScreen(activity,shell.content,library,Collections.emptySet(),new HomeScreen.Listener() {
            public void play(Media m) { calls.add("play:"+m.id); }
            public void details(Media m) { calls.add("details:"+m.id); }
            public void cinema() { calls.add("cinema"); }
            public void gaming() { calls.add("gaming"); }
            public long position(Media m) { return positions.getOrDefault(m.id,0L); }
            public void artwork(Media m,ImageView target,boolean wide) { }
            public void feature(Media m) { calls.add("feature:"+m.id); }
        });
        canvas=((android.view.ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0);
        View decor=activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(960,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(540,View.MeasureSpec.EXACTLY));
        decor.layout(0,0,960,540); decor.dispatchWindowFocusChanged(true);
    }
    @Test public void heroResumesUnfinishedMovieAndDropsFinishedMovieFromContinueRow() {
        Media first=movie("first","Primera"),watched=movie("watched","Segunda"); positions.put("watched",61000L);
        create(Arrays.asList(first,watched));
        assertTrue(calls.contains("feature:watched")); canvas.findViewWithTag("hero").performClick(); assertTrue(calls.contains("play:watched"));
        assertNotNull(canvas.findViewWithTag("Seguir viendo:watched"));
        positions.put("watched",7_199_000L); home.refresh(Collections.emptySet());
        assertNull(canvas.findViewWithTag("Seguir viendo:watched"));
    }
    @Test public void emptyLibraryStillOpensCinemaAndGaming() {
        create(Collections.emptyList()); canvas.findViewWithTag("hero").performClick(); canvas.findViewWithTag("gaming").performClick();
        assertTrue(calls.contains("cinema")); assertTrue(calls.contains("gaming"));
        assertTrue(calls.stream().noneMatch(s -> s.startsWith("play:")));
    }
    @Test public void remoteMovesBetweenMoviesAndBackToHero() {
        create(Arrays.asList(movie("first","Primera"),movie("second","Segunda")));
        View first=canvas.findViewWithTag("En tu guarida:first"),second=canvas.findViewWithTag("En tu guarida:second");
        assertTrue(first.requestFocus());
        assertSame(second,first.focusSearch(View.FOCUS_RIGHT));
        second.requestFocus();
        assertSame(canvas.findViewWithTag("hero"),second.focusSearch(View.FOCUS_UP));
    }
    @Test public void favoritesRefreshPreservesSelectedMovieAndLongPressOpensDetails() {
        create(Arrays.asList(movie("first","Primera"),movie("second","Segunda")));
        canvas.findViewWithTag("En tu guarida:second").requestFocus(); home.refresh(Collections.singleton("second"));
        assertTrue(canvas.findViewWithTag("En tu guarida:second").hasFocus());
        View favorite=canvas.findViewWithTag("Tus favoritos:second"); assertNotNull(favorite); favorite.performLongClick();
        assertTrue(calls.contains("details:second"));
    }
}
