package com.andress1014.casacine.tv;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.TimeBar;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
@RunWith(RobolectricTestRunner.class)
@Config(sdk={23,28,35})
public class PlayerRemoteTest {
    private static final String ID="b752875b-9bd1-44d2-83ad-2e1a92b2116d";
    private PlayerActivity create() {
        Context context=RuntimeEnvironment.getApplication(); context.getSharedPreferences("casacine",0).edit().putString("server","192.168.1.13:3210").apply();
        return Robolectric.buildActivity(PlayerActivity.class,new Intent(context,PlayerActivity.class).putExtra("id",ID)).create().get();
    }
    @Test public void movieTimelineHasFixedTenSecondIncrement() {
        PlayerActivity activity=create(); DefaultTimeBar bar=activity.findViewById(androidx.media3.ui.R.id.exo_progress);
        bar.setEnabled(true); bar.setDuration(10_800_000); bar.setPosition(3_600_000);
        final long[] actual={0};
        bar.addListener(new TimeBar.OnScrubListener(){ public void onScrubStart(TimeBar t,long p){actual[0]=p;} public void onScrubMove(TimeBar t,long p){actual[0]=p;} public void onScrubStop(TimeBar t,long p,boolean c){actual[0]=p;} });
        assertTrue(bar.onKeyDown(KeyEvent.KEYCODE_DPAD_RIGHT,new KeyEvent(0,0))); assertEquals(3_610_000,actual[0]);
    }
    @Test public void oneRemotePressAndHundredRepeatsCauseOneSeek() {
        PlayerActivity activity=create(); ExoPlayer player=mock(ExoPlayer.class);
        when(player.isCurrentMediaItemSeekable()).thenReturn(true); when(player.getDuration()).thenReturn(10_800_000L); when(player.getCurrentPosition()).thenReturn(3_600_000L);
        ReflectionHelpers.setField(activity,"player",player);
        assertTrue(activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_FAST_FORWARD)));
        for(int i=1;i<=100;i++) assertTrue(activity.dispatchKeyEvent(new KeyEvent(0,0,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,i)));
        assertTrue(activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_MEDIA_FAST_FORWARD)));
        verify(player,times(1)).seekTo(3_610_000L);
    }
    @Test public void backHidesControlsBeforeLeavingMovie() {
        PlayerActivity activity=create(); ExoPlayer player=mock(ExoPlayer.class); ReflectionHelpers.setField(activity,"player",player);
        androidx.media3.ui.PlayerView view=ReflectionHelpers.getField(activity,"view"); view.showController();
        activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK)); activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK));
        assertFalse(view.isControllerFullyVisible()); assertFalse(activity.isFinishing());
    }
    @Test public void mediaPauseDoesNotRepeat() {
        PlayerActivity activity=create(); ExoPlayer player=mock(ExoPlayer.class); ReflectionHelpers.setField(activity,"player",player);
        activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_PAUSE));
        activity.dispatchKeyEvent(new KeyEvent(0,0,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_PAUSE,12));
        activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_MEDIA_PAUSE)); verify(player,times(1)).pause();
    }
    @Test public void timelineFocusedArrowIsDispatchedOnlyOnce() {
        PlayerActivity activity=create(); ExoPlayer player=mock(ExoPlayer.class); when(player.isCurrentMediaItemSeekable()).thenReturn(true); when(player.getDuration()).thenReturn(10_800_000L); when(player.getCurrentPosition()).thenReturn(3_600_000L); ReflectionHelpers.setField(activity,"player",player);
        DefaultTimeBar bar=activity.findViewById(androidx.media3.ui.R.id.exo_progress); bar.requestFocus();
        activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_RIGHT)); activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_RIGHT)); verify(player,times(1)).seekTo(3_610_000L);
    }
    @Test public void subtitleMetadataIgnoresHostileUrlsAndBadIds() throws Exception {
        org.json.JSONObject value=new org.json.JSONObject("{\"id\":\""+ID+"\",\"title\":\"Película\",\"subtitles\":[{\"id\":\""+ID+"\",\"language\":\"es\",\"label\":\"Español\",\"url\":\"https://evil.example/sub.vtt\"},{\"id\":\"../escape\"}]}");
        Media media=Media.fromJson(value); assertEquals(1,media.subtitles.size()); assertFalse(media.hasPoster);
        assertEquals("http://192.168.1.13:3210/api/media/"+ID+"/subtitles/"+ID,new ServerClient("192.168.1.13:3210").subtitleUrl(ID,media.subtitles.get(0).id));
    }
    @Test public void invalidPlayerIntentClosesActivity() {
        Context context=RuntimeEnvironment.getApplication(); PlayerActivity activity=Robolectric.buildActivity(PlayerActivity.class,new Intent(context,PlayerActivity.class).putExtra("id","../../external")).create().get(); assertTrue(activity.isFinishing());
    }
}
