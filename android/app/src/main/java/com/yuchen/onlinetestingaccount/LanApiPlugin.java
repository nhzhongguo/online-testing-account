package com.yuchen.onlinetestingaccount;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Base64;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "LanApi")
public class LanApiPlugin extends Plugin {
  private final AtomicBoolean testRunning = new AtomicBoolean(false);
  @PluginMethod public void start(PluginCall call) {
    String credential = call.getString("credential", "");
    String credentialsJson = call.getString("credentialsJson", "");
    String token = call.getString("token", "");
    if (credential.isEmpty() || token.length() < 20) { call.reject("Missing credential or pairing token"); return; }
    int port = call.getInt("port", 8787);
    try {
      LanApiService.start(getContext(), credentialsJson.isEmpty() ? credential : credentialsJson, token, port);
      JSObject out = new JSObject(); out.put("port", LanApiService.port()); out.put("ip", localIp());
      call.resolve(out);
    } catch (Exception e) { call.reject("Unable to start LAN API: " + e.getMessage()); }
  }
  @PluginMethod public void update(PluginCall call) {
    String credentialsJson = call.getString("credentialsJson", "");
    try { LanApiService.update(credentialsJson); call.resolve(); }
    catch (Exception e) { call.reject("Unable to update LAN API: " + e.getMessage()); }
  }
  @PluginMethod public void stop(PluginCall call) { LanApiService.stop(getContext()); call.resolve(); }
  @PluginMethod public void status(PluginCall call) { JSObject out = new JSObject(); out.put("running", LanApiService.running()); out.put("port", LanApiService.port()); out.put("ip", localIp()); call.resolve(out); }
  @PluginMethod public void test(PluginCall call) {
    if (!testRunning.compareAndSet(false, true)) { call.reject("A LAN API test is already running"); return; }
    new Thread(() -> {
      try { call.resolve(LanApiService.test()); }
      catch (Exception e) { call.reject("Unable to test LAN API: " + e.getMessage()); }
      finally { testRunning.set(false); }
    }, "LanApiTest").start();
  }
  private String localIp() {
    try { for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) for (InetAddress a : Collections.list(ni.getInetAddresses())) if (!a.isLoopbackAddress() && a instanceof Inet4Address) return a.getHostAddress(); } catch (Exception ignored) {}
    return "";
  }

  public static class LanApiService extends Service {
    private static final String CHANNEL = "lan_api"; private static volatile ProxyServer server;
    static void start(Context context, String credential, String token, int port) throws IOException {
      stop(context); server = new ProxyServer(credential, token, port); server.start();
      Intent i = new Intent(context, LanApiService.class); if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i); else context.startService(i);
    }
    static void update(String credentialsJson) throws IOException { ProxyServer current = server; if (current == null) throw new IOException("LAN API is not running"); current.updateUpstreams(credentialsJson); }
    static JSObject test() throws Exception { ProxyServer current = server; if (current == null) throw new IOException("LAN API is not running"); return current.testConnection(); }
    static void stop(Context context) { if (server != null) { server.close(); server = null; } context.stopService(new Intent(context, LanApiService.class)); }
    static boolean running() { return server != null; } static int port() { return server == null ? 0 : server.port(); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
      if (Build.VERSION.SDK_INT >= 26) { NotificationChannel c = new NotificationChannel(CHANNEL, "LAN API service", NotificationManager.IMPORTANCE_LOW); getSystemService(NotificationManager.class).createNotificationChannel(c); }
      Notification n = new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(getApplicationInfo().icon).setContentTitle("局域网 API 服务运行中").setContentText("仅接受已配对电脑的 OpenAI 兼容请求").setOngoing(true).build();
      startForeground(4761, n); return START_NOT_STICKY;
    }
    @Override public void onDestroy() { if (server != null) { server.close(); server = null; } super.onDestroy(); }
    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
  }

  static class ProxyServer extends Thread {
    private static final String LOG_TAG = "LanApi";
    private static final String CODEX_MODEL = "gpt-5.4";
    private static final String CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
    private static final String CODEX_VERSION = "0.144.0";
    private static final int MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
    private static final int MAX_DISCOVERY_BYTES = 2 * 1024 * 1024;
    private volatile List<Upstream> upstreams; private final String token; private final ServerSocket socket; private final Semaphore clientSlots = new Semaphore(16); private volatile boolean open = true; private int nextIndex;
    ProxyServer(String credential, String token, int requestedPort) throws IOException { this.upstreams = parseUpstreams(credential); this.token = token; this.socket = new ServerSocket(); socket.setReuseAddress(true); socket.bind(new InetSocketAddress("0.0.0.0", requestedPort)); }
    synchronized void updateUpstreams(String credentials) throws IOException { this.upstreams = parseUpstreams(credentials); this.nextIndex = 0; Log.i(LOG_TAG, "upstream pool updated size=" + this.upstreams.size()); }
    int port() { return socket.getLocalPort(); } void close() { open = false; try { socket.close(); } catch (IOException ignored) {} }
    JSObject testConnection() {
      long startedAt = System.currentTimeMillis();
      List<Upstream> activeUpstreams = upstreams;
      JSObject result = new JSObject();
      JSONArray allModels = new JSONArray();
      JSONArray modelSources = new JSONArray();
      JSONArray discoveryErrors = new JSONArray();
      List<ModelOption> options = new ArrayList<>();
      Set<String> uniqueModels = new LinkedHashSet<>();

      for (Upstream upstream : activeUpstreams) {
        List<String> discovered = new ArrayList<>();
        boolean fallback = false;
        try {
          discovered.addAll(upstream.fetchModels());
        } catch (Exception error) {
          String message = upstream.name + ": " + safeMessage(error);
          discoveryErrors.put(message);
          Log.w(LOG_TAG, "model discovery failed name=" + upstream.name, error);
        }
        if (discovered.isEmpty() && upstream.kind.equals("oauth")) {
          discovered.add(CODEX_MODEL);
          fallback = true;
        } else if (discovered.isEmpty() && !upstream.model.isEmpty()) {
          discovered.add(upstream.model);
          fallback = true;
        }

        upstream.setDiscoveredModels(discovered);
        JSONArray sourceModels = new JSONArray();
        Set<String> sourceUnique = new LinkedHashSet<>();
        for (String model : discovered) {
          String normalized = model == null ? "" : model.trim();
          if (normalized.isEmpty() || !sourceUnique.add(normalized)) continue;
          sourceModels.put(normalized);
          uniqueModels.add(normalized);
          options.add(new ModelOption(normalized, upstream));
        }
        JSONObject source = new JSONObject();
        try {
          source.put("upstreamName", upstream.name);
          source.put("protocol", upstream.testProtocol());
          source.put("models", sourceModels);
          source.put("fallback", fallback);
        } catch (Exception ignored) {}
        modelSources.put(source);
      }

      for (String model : uniqueModels) allModels.put(model);
      result.put("models", allModels);
      result.put("modelSources", modelSources);
      if (discoveryErrors.length() > 0) result.put("discoveryErrors", discoveryErrors);
      if (options.isEmpty()) {
        result.put("status", 0);
        result.put("elapsedMs", System.currentTimeMillis() - startedAt);
        result.put("error", "No supported models were discovered");
        return result;
      }

      List<ModelOption> likelyTextOptions = new ArrayList<>();
      for (ModelOption option : options) if (isLikelyTextModel(option.model)) likelyTextOptions.add(option);
      if (likelyTextOptions.isEmpty()) {
        result.put("status", 0);
        result.put("elapsedMs", System.currentTimeMillis() - startedAt);
        result.put("error", "No text-compatible models were discovered");
        return result;
      }
      List<ModelOption> remainingOptions = new ArrayList<>(likelyTextOptions);
      JSONArray attemptedModels = new JSONArray();
      result.put("attemptedModels", attemptedModels);
      for (int attempt = 0; attempt < 3 && !remainingOptions.isEmpty(); attempt++) {
        ModelOption selected = remainingOptions.remove(ThreadLocalRandom.current().nextInt(remainingOptions.size()));
        for (int index = remainingOptions.size() - 1; index >= 0; index--) if (remainingOptions.get(index).model.equals(selected.model)) remainingOptions.remove(index);
        attemptedModels.put(selected.model);
        int routedIndex = findModelUpstream(selected.model, activeUpstreams);
        Upstream routedUpstream = routedIndex >= 0 ? activeUpstreams.get(routedIndex) : selected.upstream;
        String protocol = routedUpstream.testProtocol();
        String path = protocol.equals("chat_completions") ? "/v1/chat/completions" : "/v1/responses";
        result.put("selectedModel", selected.model);
        result.put("protocol", protocol);
        result.put("upstreamName", routedUpstream.name);
        result.remove("response");
        result.remove("error");

        HttpURLConnection connection = null;
        try {
          connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port() + path).openConnection();
          connection.setRequestMethod("POST");
          connection.setConnectTimeout(5000);
          connection.setReadTimeout(120000);
          connection.setRequestProperty("Authorization", "Bearer " + token);
          connection.setRequestProperty("Content-Type", "application/json");
          connection.setRequestProperty("Accept", "application/json, text/event-stream");
          connection.setRequestProperty("Connection", "close");
          connection.setRequestProperty("X-LanApi-Self-Test", token);
          connection.setDoOutput(true);
          byte[] request = testPayload(selected.model, protocol);
          try (OutputStream output = connection.getOutputStream()) { output.write(request); }
          int status = connection.getResponseCode();
          String actualUpstream = connection.getHeaderField("X-LanApi-Upstream");
          if (actualUpstream != null && !actualUpstream.isEmpty()) result.put("upstreamName", decodeHeaderName(actualUpstream, routedUpstream.name));
          InputStream responseStream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
          byte[] responseBytes = responseStream == null ? new byte[0] : readLimited(responseStream, MAX_DISCOVERY_BYTES);
          String responseBody = new String(responseBytes, StandardCharsets.UTF_8);
          String summary = responseSummary(responseBody);
          result.put("status", status);
          if (status < 400) {
            result.put("response", summary.isEmpty() ? "Request completed successfully" : summary);
            break;
          }
          result.put("error", errorSummary(responseBody, status));
          if (!isUnavailableModelError(status, responseBody, selected.model)) break;
          Log.i(LOG_TAG, "self-test model unavailable model=" + selected.model + " status=" + status + "; trying another discovered model");
        } catch (Exception error) {
          result.put("status", 0);
          result.put("error", safeMessage(error));
          Log.w(LOG_TAG, "LAN API self-test failed", error);
          break;
        } finally {
          if (connection != null) connection.disconnect();
        }
      }
      result.put("elapsedMs", System.currentTimeMillis() - startedAt);
      return result;
    }
    private static byte[] testPayload(String model, String protocol) throws Exception {
      JSONObject payload = new JSONObject();
      payload.put("model", model);
      payload.put("stream", !protocol.equals("chat_completions"));
      if (protocol.equals("chat_completions")) {
        JSONArray messages = new JSONArray();
        JSONObject message = new JSONObject();
        message.put("role", "user");
        message.put("content", "Reply with exactly OK.");
        messages.put(message);
        payload.put("messages", messages);
      } else {
        payload.put("instructions", "Reply with exactly OK and no other text.");
        JSONArray input = new JSONArray();
        JSONObject message = new JSONObject();
        message.put("role", "user");
        JSONArray content = new JSONArray();
        JSONObject text = new JSONObject();
        text.put("type", "input_text");
        text.put("text", "Reply with exactly OK.");
        content.put(text);
        message.put("content", content);
        input.put(message);
        payload.put("input", input);
        payload.put("store", false);
      }
      return payload.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static String responseSummary(String body) {
      if (body == null || body.trim().isEmpty()) return "";
      StringBuilder text = new StringBuilder();
      String trimmedBody = body.trim();
      if (trimmedBody.startsWith("data:") || trimmedBody.startsWith("event:") || body.contains("\ndata:")) {
        for (String line : body.split("\\r?\\n")) {
          if (!line.startsWith("data:")) continue;
          String data = line.substring(5).trim();
          if (data.isEmpty() || data.equals("[DONE]")) continue;
          try { appendResponseText(new JSONObject(data), text); } catch (Exception ignored) {}
          if (text.length() >= 600) break;
        }
      } else {
        try { appendResponseText(new JSONObject(body), text); } catch (Exception ignored) {}
      }
      String summary = text.toString().trim();
      if (summary.isEmpty()) summary = body.replaceAll("\\s+", " ").trim();
      return truncate(summary, 600);
    }
    private static void appendResponseText(JSONObject value, StringBuilder output) {
      String type = value.optString("type", "");
      if ((type.contains("output_text") || type.equals("content_block_delta")) && value.opt("delta") instanceof String) appendLimited(output, value.optString("delta"));
      if (value.opt("text") instanceof String && ((type.contains("text") && !type.endsWith(".done")) || type.isEmpty())) appendLimited(output, value.optString("text"));
      if (value.opt("output_text") instanceof String) appendLimited(output, value.optString("output_text"));
      JSONObject response = value.optJSONObject("response");
      if (response != null && output.length() == 0) appendResponseText(response, output);
      JSONArray items = value.optJSONArray("output");
      if (items != null) for (int index = 0; index < items.length() && output.length() < 600; index++) { JSONObject item = items.optJSONObject(index); if (item != null) appendResponseText(item, output); }
      JSONArray content = value.optJSONArray("content");
      if (content != null) for (int index = 0; index < content.length() && output.length() < 600; index++) { JSONObject item = content.optJSONObject(index); if (item != null) appendResponseText(item, output); }
      JSONArray choices = value.optJSONArray("choices");
      if (choices != null) for (int index = 0; index < choices.length() && output.length() < 600; index++) {
        JSONObject choice = choices.optJSONObject(index); if (choice == null) continue;
        JSONObject delta = choice.optJSONObject("delta"); if (delta != null) appendContent(delta.opt("content"), output);
        JSONObject message = choice.optJSONObject("message"); if (message != null) appendContent(message.opt("content"), output);
      }
    }
    private static void appendContent(Object content, StringBuilder output) {
      if (content instanceof String) { appendLimited(output, (String) content); return; }
      if (!(content instanceof JSONArray)) return;
      JSONArray parts = (JSONArray) content;
      for (int index = 0; index < parts.length() && output.length() < 600; index++) {
        JSONObject part = parts.optJSONObject(index); if (part != null) appendLimited(output, part.optString("text", ""));
      }
    }
    private static void appendLimited(StringBuilder output, String value) { if (value == null || value.isEmpty() || output.length() >= 600) return; output.append(value, 0, Math.min(value.length(), 600 - output.length())); }
    private static String errorSummary(String body, int status) {
      try {
        JSONObject payload = new JSONObject(body); JSONObject error = payload.optJSONObject("error");
        if (error != null && !error.optString("message", "").isEmpty()) return truncate(error.optString("message"), 600);
      } catch (Exception ignored) {}
      String summary = responseSummary(body); return summary.isEmpty() ? "HTTP " + status : summary;
    }
    private static boolean isUnavailableModelError(int status, String body, String model) {
      if (status < 400 || status >= 500 || body == null) return false;
      String value = body.toLowerCase(Locale.ROOT);
      String modelName = model == null ? "" : model.toLowerCase(Locale.ROOT);
      boolean mentionsModel = value.contains("model") || (!modelName.isEmpty() && value.contains(modelName));
      if (!mentionsModel) return false;
      String[] unavailableMarkers = { "end of life", "end-of-life", "unavailable", "not found", "not supported", "unsupported", "does not exist", "no longer available", "invalid model", "model_not_found", "deprecated" };
      for (String marker : unavailableMarkers) if (value.contains(marker)) return true;
      return false;
    }
    private static String safeMessage(Throwable error) { String message = error == null ? "Unknown error" : error.getMessage(); return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : truncate(message, 600); }
    private static String truncate(String value, int maxLength) { return value.length() <= maxLength ? value : value.substring(0, maxLength); }
    private static boolean isLikelyTextModel(String model) {
      String value = model.toLowerCase(Locale.ROOT);
      if (value.equals("auto")) return false;
      String[] excluded = { "router", "embedding", "moderation", "whisper", "transcri", "tts", "dall-e", "image", "audio", "realtime", "computer-use" };
      for (String marker : excluded) if (value.contains(marker)) return false;
      return true;
    }
    static class ModelOption {
      final String model; final Upstream upstream;
      ModelOption(String model, Upstream upstream) { this.model = model; this.upstream = upstream; }
    }
    public void run() { while (open) try {
      final Socket client = socket.accept();
      client.setSoTimeout(15000);
      if (!clientSlots.tryAcquire()) { client.close(); continue; }
      new Thread(() -> { try { handle(client); } finally { clientSlots.release(); } }, "LanApiClient").start();
    } catch (IOException ignored) { } }
    private void handle(Socket client) { try { InputStream in = client.getInputStream(); OutputStream out = client.getOutputStream();
      BufferedInputStream bin = new BufferedInputStream(in); String head = readHeaders(bin); if (head == null) return; String[] lines = head.split("\r?\n"); String[] first = lines[0].split(" ");
      if (first.length < 2) { write(out, 400, "Bad request"); return; } String rawPath = first[1]; String path = rawPath.split("\\?", 2)[0]; int length = 0; boolean authorized = false; boolean selfTest = false;
      for (String line : lines) { int colon = line.indexOf(':'); if (colon > 0) { String key = line.substring(0, colon).trim(); String value = line.substring(colon + 1).trim(); if (key.equalsIgnoreCase("Content-Length")) length = Math.min(Integer.parseInt(value), 2 * 1024 * 1024); if (key.equalsIgnoreCase("Authorization") && value.equals("Bearer " + token)) authorized = true; if (key.equalsIgnoreCase("X-LanApi-Self-Test") && value.equals(token)) selfTest = true; } }
      byte[] body = readAtMost(bin, length); if (!authorized) { write(out, 401, "Pairing token required"); return; }
      if (!(path.equals("/v1/models") || path.equals("/v1/chat/completions") || path.equals("/v1/responses"))) { write(out, 404, "Only /v1/models, /v1/chat/completions and /v1/responses are available"); return; }
      List<Upstream> activeUpstreams = upstreams;
      if (path.equals("/v1/models") && writeConfiguredModels(out, activeUpstreams)) return;
      String requestedModel = requestModel(body); int start = findModelUpstream(requestedModel, activeUpstreams); if (start < 0) synchronized (this) { start = nextIndex++ % activeUpstreams.size(); }
      int code = 502; String type = "application/json"; byte[] result = new byte[0]; boolean attempted = false; Exception lastError = null; String usedUpstreamName = "";
      for (int attempt = 0; attempt < activeUpstreams.size(); attempt++) {
        int upstreamIndex = (start + attempt) % activeUpstreams.size(); Upstream item = activeUpstreams.get(upstreamIndex); if (!item.supports(path)) continue;
        if (selfTest && !requestedModel.isEmpty() && !item.supportsDiscoveredModel(requestedModel) && !requestedModel.equals(item.model)) continue;
        attempted = true;
        HttpURLConnection upstream = null;
        try {
          upstream = (HttpURLConnection) new URL(item.url(rawPath)).openConnection(); upstream.setRequestMethod(first[0]); upstream.setConnectTimeout(15000); upstream.setReadTimeout(120000); upstream.setRequestProperty("Authorization", "Bearer " + item.credential); upstream.setRequestProperty("Content-Type", "application/json"); upstream.setDoInput(true); item.applyHeaders(upstream);
          byte[] upstreamBody = item.applyModel(body, path, selfTest); if (upstreamBody.length > 0) { upstream.setDoOutput(true); try (OutputStream u = upstream.getOutputStream()) { u.write(upstreamBody); } }
          int attemptCode = upstream.getResponseCode(); Log.i(LOG_TAG, "path=" + path + " start=" + start + " attempt=" + (attempt + 1) + " upstream=" + upstreamIndex + " name=" + item.name + " status=" + attemptCode); InputStream response = attemptCode >= 400 ? upstream.getErrorStream() : upstream.getInputStream(); byte[] attemptResult = response == null ? new byte[0] : readLimited(response, MAX_RESPONSE_BYTES); String attemptType = upstream.getHeaderField("Content-Type"); code = attemptCode; result = attemptResult; usedUpstreamName = item.headerName(); if (attemptType != null) type = attemptType; if (code < 400) break;
        } catch (Exception error) {
          lastError = error; Log.w(LOG_TAG, "path=" + path + " attempt=" + (attempt + 1) + " name=" + item.name + " failed; trying next upstream", error);
        } finally {
          if (upstream != null) upstream.disconnect();
        }
      }
      if (!attempted) { write(out, 502, "No upstream supports this protocol"); return; }
      if (code == 502 && result.length == 0 && lastError != null) { write(out, 502, "All compatible upstreams failed"); return; }
      String upstreamHeader = selfTest && !usedUpstreamName.isEmpty() ? "X-LanApi-Upstream: " + usedUpstreamName + "\r\n" : "";
      String headers = "HTTP/1.1 " + code + " OK\r\nContent-Type: " + type + "\r\nContent-Length: " + result.length + "\r\n" + upstreamHeader + "Access-Control-Allow-Origin: *\r\n\r\n"; out.write(headers.getBytes(StandardCharsets.UTF_8)); out.write(result);
    } catch (Exception e) { Log.w(LOG_TAG, "Upstream request failed", e); try { write(client.getOutputStream(), 502, "Upstream request failed"); } catch (Exception ignored) {} } finally { try { client.close(); } catch (IOException ignored) {} } }
    private boolean writeConfiguredModels(OutputStream out, List<Upstream> activeUpstreams) throws Exception {
      Set<String> models = new LinkedHashSet<>();
      for (Upstream upstream : activeUpstreams) {
        boolean discovered = false;
        for (String model : upstream.discoveredModels) {
          String normalized = model == null ? "" : model.trim();
          if (normalized.isEmpty() || normalized.equalsIgnoreCase("auto")) continue;
          models.add(normalized);
          discovered = true;
        }
        if (!discovered && !upstream.model.isEmpty() && !upstream.model.equalsIgnoreCase("auto")) models.add(upstream.model);
        else if (!discovered && upstream.kind.equals("oauth")) models.add(CODEX_MODEL);
      }
      // With an auto-routed provider and no discovery cache, proxy /models to the
      // upstream so desktop clients receive its real catalog.
      if (models.isEmpty()) return false;
      JSONArray data = new JSONArray(); for (String model : models) { JSONObject item = new JSONObject(); item.put("id", model); item.put("object", "model"); item.put("created", 0); item.put("owned_by", "phone-provider"); data.put(item); }
      JSONObject payload = new JSONObject(); payload.put("object", "list"); payload.put("data", data); byte[] result = payload.toString().getBytes(StandardCharsets.UTF_8); out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + result.length + "\r\nAccess-Control-Allow-Origin: *\r\n\r\n").getBytes(StandardCharsets.UTF_8)); out.write(result); return true;
    }
    private int findModelUpstream(String model, List<Upstream> activeUpstreams) {
      if (model.isEmpty()) return -1;
      for (int index = 0; index < activeUpstreams.size(); index++) if (model.equals(activeUpstreams.get(index).model)) return index;
      int discoveredMatch = -1;
      for (int index = 0; index < activeUpstreams.size(); index++) if (activeUpstreams.get(index).supportsDiscoveredModel(model)) {
        if (discoveredMatch >= 0) return -1;
        discoveredMatch = index;
      }
      return discoveredMatch;
    }
    private static String requestModel(byte[] body) { if (body.length == 0) return ""; try { return new JSONObject(new String(body, StandardCharsets.UTF_8)).optString("model", ""); } catch (Exception ignored) { return ""; } }
    private static List<Upstream> parseUpstreams(String value) throws IOException {
      List<Upstream> parsed = new ArrayList<>();
      if (value.startsWith("[")) {
        try {
          JSONArray array = new JSONArray(value);
          for (int index = 0; index < array.length(); index++) {
            JSONObject entry = array.optJSONObject(index);
            if (entry == null) continue;
            String credential = entry.optString("credential", "").trim();
            if (credential.isEmpty()) continue;
            String kind = entry.optString("kind", ""); String baseUrl = entry.optString("baseUrl", "").trim(); boolean custom = kind.equals("provider") || !baseUrl.isEmpty();
            String normalizedKind = custom ? "provider" : (kind.equals("oauth") ? "oauth" : "api_key");
            parsed.add(new Upstream(credential, custom ? baseUrl : (normalizedKind.equals("oauth") ? CODEX_BASE_URL : "https://api.openai.com"), custom ? entry.optString("protocol", "responses") : (normalizedKind.equals("oauth") ? "responses" : "both"), custom ? entry.optString("model", "").trim() : "", entry.optString("name", custom ? "custom-provider" : "account"), normalizedKind, entry.optString("accountId", "").trim()));
          }
        } catch (Exception error) {
          throw new IOException("Invalid credential pool", error);
        }
      } else if (!value.isEmpty()) {
        parsed.add(new Upstream(value, "https://api.openai.com", "both", "", "account", "api_key", ""));
      }
      if (parsed.isEmpty()) throw new IOException("No usable upstreams");
      return Collections.unmodifiableList(parsed);
    }
    static class Upstream {
      final String credential, baseUrl, protocol, model, name, kind, accountId;
      private volatile Set<String> discoveredModels = Collections.emptySet();
      Upstream(String credential, String baseUrl, String protocol, String model, String name, String kind, String accountId) throws IOException { this.credential = credential; this.baseUrl = normalizeBaseUrl(baseUrl); this.protocol = protocol; this.model = model; String displayName = name == null ? "" : name.replaceAll("\\p{Cntrl}", " ").trim(); this.name = displayName.isEmpty() ? "upstream" : displayName; this.kind = kind; String jwtAccountId = jwtAccountId(credential); String importedAccountId = accountId.matches("\\d+") ? "" : accountId; this.accountId = jwtAccountId.isEmpty() ? importedAccountId : jwtAccountId; }
      boolean supports(String path) { if (path.equals("/v1/models") || protocol.equals("both")) return true; if (path.equals("/v1/responses")) return protocol.equals("responses"); if (path.equals("/v1/chat/completions")) return protocol.equals("chat_completions"); return false; }
      boolean supportsDiscoveredModel(String requestedModel) { return discoveredModels.contains(requestedModel); }
      String testProtocol() { return protocol.equals("chat_completions") ? "chat_completions" : "responses"; }
      String headerName() { return Base64.encodeToString(name.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
      void setDiscoveredModels(List<String> models) { this.discoveredModels = Collections.unmodifiableSet(new LinkedHashSet<>(models)); }
      List<String> fetchModels() throws Exception {
        String modelsUrl = kind.equals("oauth") ? baseUrl + "/models?client_version=" + CODEX_VERSION : url("/v1/models");
        HttpURLConnection connection = null;
        try {
          connection = (HttpURLConnection) new URL(modelsUrl).openConnection();
          connection.setRequestMethod("GET");
          connection.setConnectTimeout(12000);
          connection.setReadTimeout(20000);
          connection.setRequestProperty("Authorization", "Bearer " + credential);
          applyHeaders(connection);
          connection.setRequestProperty("Accept", "application/json");
          int status = connection.getResponseCode();
          InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
          String body = stream == null ? "" : new String(readLimited(stream, MAX_DISCOVERY_BYTES), StandardCharsets.UTF_8);
          if (status >= 400) throw new IOException("model endpoint returned HTTP " + status + (body.isEmpty() ? "" : ": " + truncate(body.replaceAll("\\s+", " "), 240)));
          List<String> models = parseModels(body);
          if (models.isEmpty()) throw new IOException("model endpoint returned no models");
          return models;
        } finally { if (connection != null) connection.disconnect(); }
      }
      private static List<String> parseModels(String body) throws Exception {
        List<String> parsed = new ArrayList<>();
        Object root = new org.json.JSONTokener(body).nextValue();
        JSONArray array = root instanceof JSONArray ? (JSONArray) root : null;
        if (root instanceof JSONObject) {
          JSONObject object = (JSONObject) root;
          array = object.optJSONArray("data");
          if (array == null) array = object.optJSONArray("models");
        }
        if (array == null) return parsed;
        Set<String> unique = new LinkedHashSet<>();
        for (int index = 0; index < array.length(); index++) {
          Object item = array.opt(index); String id = "";
          if (item instanceof String) id = ((String) item).trim();
          else if (item instanceof JSONObject) {
            JSONObject object = (JSONObject) item;
            if (!object.optBoolean("supported_in_api", true) || object.optString("visibility", "").equalsIgnoreCase("hide")) continue;
            id = object.optString("id", "").trim();
            if (id.isEmpty()) id = object.optString("slug", "").trim();
            if (id.isEmpty()) id = object.optString("model", "").trim();
            if (id.isEmpty()) id = object.optString("name", "").trim();
          }
          if (!id.isEmpty() && unique.add(id)) parsed.add(id);
        }
        return parsed;
      }
      String url(String path) { if (kind.equals("oauth") && path.split("\\?", 2)[0].equals("/v1/responses")) return baseUrl + "/responses"; String suffix = path; if (baseUrl.endsWith("/v1") && suffix.startsWith("/v1")) suffix = suffix.substring(3); return baseUrl + suffix; }
      void applyHeaders(HttpURLConnection upstream) { if (!kind.equals("oauth")) return; upstream.setRequestProperty("Accept", "text/event-stream"); upstream.setRequestProperty("OpenAI-Beta", "responses=experimental"); upstream.setRequestProperty("Originator", "codex_cli_rs"); upstream.setRequestProperty("User-Agent", "codex_cli_rs/" + CODEX_VERSION + " (Android; arm64)"); upstream.setRequestProperty("Version", CODEX_VERSION); if (!accountId.isEmpty()) upstream.setRequestProperty("chatgpt-account-id", accountId); }
      byte[] applyModel(byte[] body, String path, boolean selfTest) { if (model.isEmpty() || body.length == 0 || path.equals("/v1/models")) return body; try { JSONObject payload = new JSONObject(new String(body, StandardCharsets.UTF_8)); String requestedModel = payload.optString("model", ""); if (selfTest && !requestedModel.isEmpty() && supportsDiscoveredModel(requestedModel)) return body; payload.put("model", model); return payload.toString().getBytes(StandardCharsets.UTF_8); } catch (Exception ignored) { return body; } }
      private static String jwtAccountId(String credential) {
        try {
          String[] parts = credential.split("\\."); if (parts.length < 2) return "";
          String json = new String(Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8);
          JSONObject payload = new JSONObject(json);
          String direct = payload.optString("https://api.openai.com/auth.chatgpt_account_id", "").trim();
          if (!direct.isEmpty()) return direct;
          JSONObject auth = payload.optJSONObject("https://api.openai.com/auth");
          return auth == null ? "" : auth.optString("chatgpt_account_id", "").trim();
        } catch (Exception ignored) { return ""; }
      }
      private static String normalizeBaseUrl(String value) throws IOException { String normalized = value == null ? "" : value.trim(); while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1); try { URL url = new URL(normalized); String scheme = url.getProtocol(); if (!(scheme.equals("http") || scheme.equals("https"))) throw new IOException("Unsupported provider URL"); return normalized; } catch (MalformedURLException error) { throw new IOException("Invalid provider URL", error); } }
    }
    private static String decodeHeaderName(String value, String fallback) {
      try { return new String(Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8); }
      catch (Exception ignored) { return fallback; }
    }
    private static byte[] readAtMost(InputStream input, int length) throws IOException {
      ByteArrayOutputStream output = new ByteArrayOutputStream(Math.max(0, length));
      byte[] buffer = new byte[Math.min(8192, Math.max(1, length))];
      int remaining = length;
      while (remaining > 0) {
        int count = input.read(buffer, 0, Math.min(buffer.length, remaining));
        if (count < 0) break;
        if (count == 0) continue;
        output.write(buffer, 0, count);
        remaining -= count;
      }
      return output.toByteArray();
    }
    private static byte[] readLimited(InputStream input, int maxBytes) throws IOException {
      ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maxBytes, 8192));
      byte[] buffer = new byte[8192];
      int total = 0;
      for (int count; (count = input.read(buffer)) >= 0;) {
        if (count == 0) continue;
        total += count;
        if (total > maxBytes) throw new IOException("Upstream response exceeds " + maxBytes + " bytes");
        output.write(buffer, 0, count);
      }
      return output.toByteArray();
    }
    private String readHeaders(BufferedInputStream in) throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); int x, last = 0; while ((x = in.read()) != -1 && b.size() < 32768) { b.write(x); if (last == '\r' && x == '\n') { String s = new String(b.toByteArray(), StandardCharsets.UTF_8); if (s.endsWith("\r\n\r\n")) return s; } last = x; } return null; }
    private void write(OutputStream out, int code, String message) throws IOException { byte[] data = ("{\"error\":{\"message\":\"" + message + "\"}}").getBytes(StandardCharsets.UTF_8); out.write(("HTTP/1.1 " + code + " Error\r\nContent-Type: application/json\r\nContent-Length: " + data.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8)); out.write(data); }
  }
}
