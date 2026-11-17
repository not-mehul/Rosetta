package io.github.notmehul.rosetta;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Text shared to Rosetta from another app (a selection from a browser, an
 * email): MainActivity hands the SEND intent's text and subject here, and the
 * page keeps it as a document (src/platform/shared.ts). Kept until the page
 * listens, so text shared before it has loaded isn't lost.
 */
@CapacitorPlugin(name = "SharedText")
public class SharedTextPlugin extends Plugin {

    /** Longer than any article; a shared text past this is cut, not refused. */
    private static final int MAX_CHARS = 2_000_000;

    void offer(String text, String subject) {
        if (text == null || text.trim().isEmpty()) return;
        JSObject data = new JSObject();
        data.put("text", text.length() > MAX_CHARS ? text.substring(0, MAX_CHARS) : text);
        if (subject != null && !subject.trim().isEmpty()) data.put("subject", subject.trim());
        notifyListeners("shared", data, true);
    }
}
