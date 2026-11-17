package io.github.notmehul.rosetta;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Folders the reader chooses with the system picker (the Storage Access
 * Framework), for the sync file and the weekly backups. Since Android 11 an
 * app can't open files in shared storage that another app wrote, so a file
 * Syncthing or Dropbox replaced in Documents would be unreadable; a folder
 * chosen here stays readable and writable, whoever wrote its files, until
 * the reader forgets it (src/platform/folders.ts).
 *
 * Each folder is kept under a key ("sync", "backup", or "import" for a folder
 * of books to add) as its tree URI, with the permission persisted. The sync
 * and backup files are UTF-8 text; walk and readBytes list and read any file.
 */
@CapacitorPlugin(name = "Folders")
public class FolderPlugin extends Plugin {

    private static final String PREFS = "rosetta.folders";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String key(PluginCall call) {
        String key = call.getString("key", "sync");
        return "sync".equals(key) || "backup".equals(key) || "import".equals(key) ? key : null;
    }

    /** The tree chosen for a key, if its permission is still held. */
    private Uri tree(String key) {
        String saved = prefs().getString(key, null);
        if (saved == null) return null;
        Uri uri = Uri.parse(saved);
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(uri) && p.isReadPermission() && p.isWritePermission()) return uri;
        }
        return null;
    }

    private String displayName(Uri tree) {
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = getContext().getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return tree.getLastPathSegment();
    }

    /** The document for a file directly in the tree, or null. */
    private Uri child(Uri tree, String name) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String[] columns = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        try (Cursor c = resolver.query(children, columns, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
            }
        }
        return null;
    }

    @PluginMethod
    public void status(PluginCall call) {
        String key = key(call);
        if (key == null) {
            call.reject("Unknown folder");
            return;
        }
        Uri tree = tree(key);
        JSObject out = new JSObject();
        out.put("chosen", tree != null);
        if (tree != null) out.put("name", displayName(tree));
        call.resolve(out);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        if (key(call) == null) {
            call.reject("Unknown folder");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            call.reject("cancelled", "CANCELLED");
            return;
        }
        String key = key(call);
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException e) {
            call.reject("That folder can't be kept: " + e.getMessage());
            return;
        }
        // Let go of the folder this key had before, unless another key still uses it.
        String before = prefs().getString(key, null);
        prefs().edit().putString(key, uri.toString()).apply();
        if (before != null && !before.equals(uri.toString()) && !usedByAnother(key, before)) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(before), flags);
            } catch (Exception ignored) {}
        }
        JSObject out = new JSObject();
        out.put("chosen", true);
        out.put("name", displayName(uri));
        call.resolve(out);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        String key = key(call);
        if (key == null) {
            call.reject("Unknown folder");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void read(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("No file named");
            return;
        }
        Uri tree = treeFor(call);
        if (tree == null) return;
        try {
            Uri file = child(tree, name);
            JSObject out = new JSObject();
            if (file == null) {
                out.put("data", org.json.JSONObject.NULL);
                call.resolve(out);
                return;
            }
            try (InputStream in = getContext().getContentResolver().openInputStream(file)) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while (in != null && (n = in.read(buf)) > 0) bytes.write(buf, 0, n);
                out.put("data", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Reading " + name + " failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (name == null || data == null) {
            call.reject("Nothing to write");
            return;
        }
        Uri tree = treeFor(call);
        if (tree == null) return;
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri file = child(tree, name);
            if (file == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                file = DocumentsContract.createDocument(resolver, parent, "application/json", name);
            }
            if (file == null) throw new IllegalStateException("the folder refused a new file");
            // "wt": write over the whole file, not into its start.
            try (OutputStream out = resolver.openOutputStream(file, "wt")) {
                if (out == null) throw new IllegalStateException("no stream");
                out.write(data.getBytes(StandardCharsets.UTF_8));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Writing " + name + " failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        Uri tree = treeFor(call);
        if (tree == null) return;
        JSArray names = new JSArray();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = getContext().getContentResolver().query(children, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            while (c != null && c.moveToNext()) names.put(c.getString(0));
        } catch (Exception e) {
            call.reject("Listing the folder failed: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("names", names);
        call.resolve(out);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("No file named");
            return;
        }
        Uri tree = treeFor(call);
        if (tree == null) return;
        try {
            Uri file = child(tree, name);
            if (file != null) DocumentsContract.deleteDocument(getContext().getContentResolver(), file);
            call.resolve();
        } catch (Exception e) {
            call.reject("Removing " + name + " failed: " + e.getMessage());
        }
    }

    private boolean usedByAnother(String key, String uri) {
        for (String other : new String[] { "sync", "backup", "import" }) {
            if (!other.equals(key) && uri.equals(prefs().getString(other, null))) return true;
        }
        return false;
    }

    private static final int MAX_FILES = 5000;
    private static final int MAX_DEPTH = 8;

    /** Every file under the folder, as paths inside it ("Author/Book/book.epub"). */
    @PluginMethod
    public void walk(PluginCall call) {
        Uri tree = treeFor(call);
        if (tree == null) return;
        JSArray paths = new JSArray();
        try {
            walkInto(tree, DocumentsContract.getTreeDocumentId(tree), "", 0, paths);
        } catch (Exception e) {
            call.reject("Reading the folder failed: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("paths", paths);
        call.resolve(out);
    }

    private void walkInto(Uri tree, String docId, String prefix, int depth, JSArray paths) {
        if (depth > MAX_DEPTH || paths.length() >= MAX_FILES) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] columns = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE };
        try (Cursor c = getContext().getContentResolver().query(children, columns, null, null, null)) {
            while (c != null && c.moveToNext() && paths.length() < MAX_FILES) {
                String name = c.getString(1);
                if (name == null || name.startsWith(".")) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) walkInto(tree, c.getString(0), prefix + name + "/", depth + 1, paths);
                else paths.put(prefix + name);
            }
        }
    }

    /** A file's bytes, as base64, by its path inside the folder. */
    @PluginMethod
    public void readBytes(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("No file named");
            return;
        }
        Uri tree = treeFor(call);
        if (tree == null) return;
        try {
            String docId = DocumentsContract.getTreeDocumentId(tree);
            Uri file = null;
            String[] parts = path.split("/");
            for (int i = 0; i < parts.length; i++) {
                file = childOf(tree, docId, parts[i]);
                if (file == null) break;
                docId = DocumentsContract.getDocumentId(file);
            }
            if (file == null) {
                call.reject("No such file: " + path);
                return;
            }
            try (InputStream in = getContext().getContentResolver().openInputStream(file)) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while (in != null && (n = in.read(buf)) > 0) bytes.write(buf, 0, n);
                JSObject out = new JSObject();
                out.put("data", android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP));
                call.resolve(out);
            }
        } catch (Exception e) {
            call.reject("Reading " + path + " failed: " + e.getMessage());
        }
    }

    /** The document named `name` directly in the directory `docId`, or null. */
    private Uri childOf(Uri tree, String docId, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] columns = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        try (Cursor c = getContext().getContentResolver().query(children, columns, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
            }
        }
        return null;
    }

    /** The call's folder, or null after rejecting the call. */
    private Uri treeFor(PluginCall call) {
        String key = key(call);
        Uri tree = key == null ? null : tree(key);
        if (tree == null) call.reject("No folder chosen", "NO_FOLDER");
        return tree;
    }
}
