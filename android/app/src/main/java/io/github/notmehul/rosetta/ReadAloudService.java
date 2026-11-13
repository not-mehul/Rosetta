package io.github.notmehul.rosetta;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps reading aloud going with the screen off (src/state/speech.svelte.ts).
 *
 * While Rosetta reads, this foreground service of the media-playback type
 * keeps the app alive and holds a partial wake lock, and its media session
 * puts play, pause and skip on the lock screen, in the notification and on
 * headphone and car buttons. Unplugging headphones, a call or another app
 * taking the audio pauses. Every button goes back to the page as an action
 * (ReadAloudPlugin), which does the reading; the service only reports and
 * relays. It stops itself when reading stops.
 */
public class ReadAloudService extends Service {

    static final String ACTION_SHOW = "io.github.notmehul.rosetta.readaloud.SHOW";
    static final String ACTION_STOP = "io.github.notmehul.rosetta.readaloud.STOP";
    static final String ACTION_BUTTON = "io.github.notmehul.rosetta.readaloud.BUTTON";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_PLAYING = "playing";
    static final String EXTRA_BUTTON = "button";

    private static final String CHANNEL = "read_aloud";
    private static final int NOTIFICATION_ID = 41;
    private static final long WAKE_LIMIT_MS = 3 * 60 * 60 * 1000L;

    /** The running service, so updates can reach it without starting it again from the background. */
    private static ReadAloudService running;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    private boolean noisyRegistered = false;
    private String title = "";
    private String subtitle = "";
    private boolean playing = false;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) ReadAloudPlugin.send("pause");
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focus = (change) -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) ReadAloudPlugin.send("pause");
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        session = new MediaSession(this, "Rosetta read aloud");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                ReadAloudPlugin.send("play");
            }

            @Override
            public void onPause() {
                ReadAloudPlugin.send("pause");
            }

            @Override
            public void onSkipToNext() {
                ReadAloudPlugin.send("next");
            }

            @Override
            public void onSkipToPrevious() {
                ReadAloudPlugin.send("previous");
            }

            @Override
            public void onStop() {
                ReadAloudPlugin.send("stop");
            }
        });
        session.setActive(true);
        running = this;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Rosetta:ReadAloud");
        wakeLock.setReferenceCounted(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.read_aloud_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopReading();
            return START_NOT_STICKY;
        }
        if (ACTION_BUTTON.equals(action)) {
            ReadAloudPlugin.send(intent.getStringExtra(EXTRA_BUTTON));
            return START_NOT_STICKY;
        }
        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) title = nonNull(intent.getStringExtra(EXTRA_TITLE));
            if (intent.hasExtra(EXTRA_SUBTITLE)) subtitle = nonNull(intent.getStringExtra(EXTRA_SUBTITLE));
            playing = intent.getBooleanExtra(EXTRA_PLAYING, playing);
        }
        show();
        return START_NOT_STICKY;
    }

    /** Updates a running service in place. False when none is running. */
    static boolean apply(String newTitle, String newSubtitle, boolean nowPlaying) {
        ReadAloudService service = running;
        if (service == null) return false;
        if (newTitle != null) service.title = newTitle;
        if (newSubtitle != null) service.subtitle = newSubtitle;
        service.playing = nowPlaying;
        service.show();
        return true;
    }

    private static String nonNull(String s) {
        return s == null ? "" : s;
    }

    private void show() {
        session.setMetadata(
            new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .build()
        );
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP;
        session.setPlaybackState(
            new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build()
        );

        Notification notification = build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (playing) {
            wakeLock.acquire(WAKE_LIMIT_MS);
            takeAudio();
        } else if (wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private Notification build() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL)
            : new Notification.Builder(this);
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        b.setSmallIcon(R.drawable.ic_stat_read_aloud)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setDeleteIntent(button("stop", 4))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, getString(R.string.read_aloud_previous), button("previous", 1)).build())
            .addAction(
                playing
                    ? new Notification.Action.Builder(android.R.drawable.ic_media_pause, getString(R.string.read_aloud_pause), button("pause", 2)).build()
                    : new Notification.Action.Builder(android.R.drawable.ic_media_play, getString(R.string.read_aloud_play), button("play", 2)).build()
            )
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, getString(R.string.read_aloud_next), button("next", 3)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private PendingIntent button(String name, int code) {
        Intent intent = new Intent(this, ReadAloudService.class).setAction(ACTION_BUTTON).putExtra(EXTRA_BUTTON, name);
        return PendingIntent.getService(this, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void takeAudio() {
        if (!noisyRegistered) {
            IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(noisy, filter);
            noisyRegistered = true;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setOnAudioFocusChangeListener(focus)
                    .build();
            }
            audio.requestAudioFocus(focusRequest);
        } else {
            audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void releaseAudio() {
        if (noisyRegistered) {
            unregisterReceiver(noisy);
            noisyRegistered = false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) audio.abandonAudioFocusRequest(focusRequest);
        } else {
            audio.abandonAudioFocus(focus);
        }
    }

    private void stopReading() {
        if (running == this) running = null;
        playing = false;
        if (wakeLock.isHeld()) wakeLock.release();
        releaseAudio();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        if (wakeLock.isHeld()) wakeLock.release();
        releaseAudio();
        session.setActive(false);
        session.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
