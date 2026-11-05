package io.github.notmehul.rosetta;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Volume keys as page turns while a document is open and the setting is on.
 * MainActivity hands key events here; when enabled they are passed to the
 * page as "press" and not to the system volume.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    private volatile boolean enabled = false;

    @PluginMethod
    public void enable(PluginCall call) {
        enabled = true;
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        enabled = false;
        call.resolve();
    }

    boolean isEnabled() {
        return enabled;
    }

    void press(String direction) {
        JSObject data = new JSObject();
        data.put("direction", direction);
        notifyListeners("press", data);
    }
}
