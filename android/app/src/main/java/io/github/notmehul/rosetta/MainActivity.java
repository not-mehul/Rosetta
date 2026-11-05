package io.github.notmehul.rosetta;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

/**
 * Capacitor shell for Rosetta. Documents opened with Rosetta arrive as VIEW
 * intents (AndroidManifest.xml), which the App plugin passes to the page as
 * appUrlOpen (src/platform/intake.ts). Volume keys turn pages while the
 * reader asks for them (VolumeKeysPlugin, src/platform/device.ts).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeKeysPlugin.class);
        super.onCreate(savedInstanceState);
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
