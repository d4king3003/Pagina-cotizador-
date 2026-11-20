package com.tvsroosevelt.cotizador;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Cotizador TVS: el panel (solo Cotizar y Fichas técnicas) dentro de un WebView sin conexión. */
public class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/app.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFFECE6DC);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // El panel se sirve desde los archivos de la app, sin internet
                Uri u = request.getUrl();
                String path = u.getPath();
                if (!"appassets.androidplatform.net".equals(u.getHost()) || path == null || !path.startsWith("/assets/")) return null;
                try {
                    String name = path.substring("/assets/".length());
                    String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript"
                            : name.endsWith(".css") ? "text/css" : name.endsWith(".png") ? "image/png" : "application/octet-stream";
                    return new WebResourceResponse(mime, "utf-8", getAssets().open(name));
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "No encontrado", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                // Enlaces externos (por ejemplo WhatsApp) se abren con su app
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    private static String extension(String mime, String fallback) {
        if (mime == null) return fallback;
        if (mime.contains("png")) return ".png";
        if (mime.contains("jpeg") || mime.contains("jpg")) return ".jpg";
        if (mime.contains("pdf")) return ".pdf";
        return fallback;
    }

    /** Lo que el panel puede pedirle al teléfono. */
    private class Bridge {
        @JavascriptInterface
        public void copyImage(String base64, String mime) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "compartir");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File file = new File(dir, "Cotizacion-TVS-" + System.currentTimeMillis() + extension(mime, ".png"));
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(data); }
                final Uri uri = Uri.parse("content://" + ImageProvider.AUTHORITY + "/" + Uri.encode(file.getName()));
                runOnUiThread(() -> {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    ContentResolver cr = getContentResolver();
                    cm.setPrimaryClip(ClipData.newUri(cr, "Imagen TVS", uri));
                    // Android 13+ ya muestra su propio aviso al copiar
                    if (Build.VERSION.SDK_INT < 33)
                        Toast.makeText(MainActivity.this, "Imagen copiada. Pegala en el chat de WhatsApp.", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                toast("No se pudo copiar la imagen: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Texto TVS", text));
                if (Build.VERSION.SDK_INT < 33)
                    Toast.makeText(MainActivity.this, "Texto copiado.", Toast.LENGTH_SHORT).show();
            });
        }

        /** Guarda imágenes en la Galería (Imágenes/TVS Cotizador) y lo demás en Descargas. */
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                boolean image = mime != null && mime.startsWith("image/");
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/TVS Cotizador");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = image
                        ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                ContentResolver cr = getContentResolver();
                Uri uri = cr.insert(collection, v);
                if (uri == null) throw new Exception("sin espacio");
                try (OutputStream out = cr.openOutputStream(uri)) { out.write(data); }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, v, null, null);
                toast(image ? "Imagen guardada en tu Galería (TVS Cotizador)." : "Archivo guardado en Descargas/TVS Cotizador.");
            } catch (Exception e) {
                toast("No se pudo guardar: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void toast(String msg) {
            MainActivity.this.toast(msg);
        }
    }
}
