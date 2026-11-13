package io.github.notmehul.rosetta;

import android.content.Context;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** Receives the book to continue from the app (src/platform/widget.ts). */
@CapacitorPlugin(name = "ReadingWidget")
public class ReadingWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        String id = call.getString("id", "");
        String cover = call.getString("cover");
        File file = new File(context.getFilesDir(), ReadingWidget.COVER);
        boolean sameBook = id.equals(context.getSharedPreferences(ReadingWidget.PREFS, Context.MODE_PRIVATE).getString("id", ""));
        boolean hasCover = sameBook && file.exists();
        if (cover != null) {
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(cover, Base64.DEFAULT));
                hasCover = true;
            } catch (IOException | IllegalArgumentException e) {
                hasCover = false;
            }
        } else if (!sameBook) {
            file.delete();
        }
        context.getSharedPreferences(ReadingWidget.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("id", id)
            .putString("title", call.getString("title", ""))
            .putString("author", call.getString("author", ""))
            .putInt("percent", call.getInt("percent", 0))
            .putString("eyebrow", call.getString("eyebrow", "Continue reading"))
            .putString("progress", call.getString("progress", ""))
            .putString("empty", call.getString("empty", ""))
            .putBoolean("hasCover", hasCover && call.getBoolean("hasCover", false))
            .apply();
        ReadingWidget.refresh(context);
        call.resolve();
    }
}
