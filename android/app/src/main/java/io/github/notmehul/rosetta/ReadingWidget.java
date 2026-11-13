package io.github.notmehul.rosetta;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;

/**
 * The Continue Reading widget: the book last opened and not finished, its
 * cover and how far in. The app sends the book through ReadingWidgetPlugin
 * whenever it changes, so the widget never refreshes on a timer. Tapping it
 * opens the book at the same place (rosetta://open?id=…); with nothing to
 * continue, it opens the library.
 */
public class ReadingWidget extends AppWidgetProvider {

    static final String PREFS = "reading_widget";
    static final String COVER = "widget-cover.img";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    /** Redraws every Continue Reading widget on the home screen. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ReadingWidget.class));
        if (ids.length > 0) manager.updateAppWidget(ids, views(context));
    }

    private static RemoteViews views(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.reading_widget);
        String id = prefs.getString("id", "");
        boolean reading = !id.isEmpty();

        views.setTextViewText(R.id.widget_eyebrow, prefs.getString("eyebrow", "Continue reading"));
        views.setTextViewText(R.id.widget_title, reading ? prefs.getString("title", "") : prefs.getString("empty", "Open a book in Rosetta."));
        String author = reading ? prefs.getString("author", "") : "";
        views.setTextViewText(R.id.widget_author, author);
        views.setViewVisibility(R.id.widget_author, author.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.widget_progress_label, prefs.getString("progress", ""));
        views.setProgressBar(R.id.widget_progress, 100, prefs.getInt("percent", 0), false);
        int progress = reading ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.widget_progress, progress);
        views.setViewVisibility(R.id.widget_progress_label, progress);

        Bitmap cover = reading && prefs.getBoolean("hasCover", false) ? cover(context) : null;
        if (cover != null) views.setImageViewBitmap(R.id.widget_cover, cover);
        views.setViewVisibility(R.id.widget_cover, cover != null ? View.VISIBLE : View.GONE);

        Intent open = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (reading) open.setAction(Intent.ACTION_VIEW).setData(Uri.parse("rosetta://open?id=" + Uri.encode(id)));
        PendingIntent tap = PendingIntent.getActivity(
            context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, tap);
        return views;
    }

    /** The saved cover, scaled down so the widget stays well under the binder limit. */
    private static Bitmap cover(Context context) {
        File file = new File(context.getFilesDir(), COVER);
        if (!file.exists()) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        if (bounds.outHeight <= 0) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = Math.max(1, Integer.highestOneBit(bounds.outHeight / 240));
        Bitmap bitmap = BitmapFactory.decodeFile(file.getPath(), options);
        if (bitmap == null || bitmap.getHeight() <= 240) return bitmap;
        int width = Math.max(1, bitmap.getWidth() * 240 / bitmap.getHeight());
        return Bitmap.createScaledBitmap(bitmap, width, 240, true);
    }
}
