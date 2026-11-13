package io.github.notmehul.rosetta;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;

/**
 * The page's side of ReadAloudService (src/platform/read-aloud.ts): show and
 * update the lock-screen controls while reading aloud, and hear their
 * buttons back as "action" events (play, pause, next, previous, stop).
 */
@CapacitorPlugin(name = "ReadAloud")
public class ReadAloudPlugin extends Plugin {

    private static WeakReference<ReadAloudPlugin> current = new WeakReference<>(null);

    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    /** From the service: a button was pressed. */
    static void send(String action) {
        ReadAloudPlugin plugin = current.get();
        if (plugin == null || action == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("action", data, true);
    }

    /** Shows or updates the controls: title, subtitle, and whether it is playing. */
    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        String title = call.hasOption("title") ? call.getString("title", "") : null;
        String subtitle = call.hasOption("subtitle") ? call.getString("subtitle", "") : null;
        // Already showing: update it in place (a lock-screen button can arrive while the app is in the background).
        getActivity().runOnUiThread(() -> {
            if (ReadAloudService.apply(title, subtitle, playing)) {
                call.resolve();
                return;
            }
            start(context, title, subtitle, playing, call);
        });
    }

    private void start(Context context, String title, String subtitle, boolean playing, PluginCall call) {
        Intent intent = new Intent(context, ReadAloudService.class).setAction(ReadAloudService.ACTION_SHOW);
        if (title != null) intent.putExtra(ReadAloudService.EXTRA_TITLE, title);
        if (subtitle != null) intent.putExtra(ReadAloudService.EXTRA_SUBTITLE, subtitle);
        intent.putExtra(ReadAloudService.EXTRA_PLAYING, playing);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            call.resolve();
        } catch (RuntimeException e) {
            // Android 12+ refuses to start a foreground service from the background.
            call.reject("The read-aloud controls couldn't be shown: " + e.getMessage());
        }
    }

    /** Takes the controls away. */
    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        try {
            context.startService(new Intent(context, ReadAloudService.class).setAction(ReadAloudService.ACTION_STOP));
        } catch (RuntimeException ignored) {
            context.stopService(new Intent(context, ReadAloudService.class));
        }
        call.resolve();
    }
}
