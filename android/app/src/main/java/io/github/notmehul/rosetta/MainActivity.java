package io.github.notmehul.rosetta;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

/**
 * Capacitor shell for Rosetta. Documents opened with Rosetta arrive as VIEW
 * intents (AndroidManifest.xml), which the App plugin passes to the page as
 * appUrlOpen (src/platform/intake.ts). Volume keys turn pages while the
 * reader asks for them (VolumeKeysPlugin, src/platform/device.ts). Reading
 * aloud carries on with the screen off (ReadAloudPlugin, ReadAloudService).
 * Sync and backups use folders chosen with the system picker (FolderPlugin).
 * Text shared to Rosetta becomes a document (SharedTextPlugin).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeKeysPlugin.class);
        registerPlugin(ReadAloudPlugin.class);
        registerPlugin(ReadingWidgetPlugin.class);
        registerPlugin(FolderPlugin.class);
        registerPlugin(SharedTextPlugin.class);
        super.onCreate(savedInstanceState);
        shared(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        shared(intent);
    }

    /** Text shared to Rosetta (a SEND intent): handed to the page, which keeps it as a document. */
    private void shared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("SharedText");
        if (handle != null && text != null) ((SharedTextPlugin) handle.getInstance()).offer(text.toString(), subject);
        // Handled once: a configuration change re-delivers the intent otherwise.
        intent.setAction(Intent.ACTION_MAIN);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) {
            VolumeKeysPlugin plugin = volumeKeys();
            if (plugin != null && plugin.isEnabled()) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) plugin.press(code == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up");
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private VolumeKeysPlugin volumeKeys() {
        if (getBridge() == null) return null;
        PluginHandle handle = getBridge().getPlugin("VolumeKeys");
        return handle == null ? null : (VolumeKeysPlugin) handle.getInstance();
    }
}
