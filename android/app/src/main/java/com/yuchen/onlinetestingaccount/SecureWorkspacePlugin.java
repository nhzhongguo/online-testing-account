package com.yuchen.onlinetestingaccount;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureWorkspace")
public class SecureWorkspacePlugin extends Plugin {
  private static final String PREFERENCES = "secure_workspace";
  private static final String WORKSPACE_KEY = "encrypted_workspace";
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "account_pulse_workspace_v1";
  private static final int GCM_TAG_LENGTH = 128;

  @PluginMethod
  public void load(PluginCall call) {
    try {
      String encryptedWorkspace = preferences().getString(WORKSPACE_KEY, null);
      JSObject result = new JSObject();
      result.put("available", true);
      if (encryptedWorkspace != null) result.put("workspace", decrypt(encryptedWorkspace));
      call.resolve(result);
    } catch (Exception exception) {
      call.reject("Unable to read secure workspace", exception);
    }
  }

  @PluginMethod
  public void save(PluginCall call) {
    String workspace = call.getString("workspace");
    if (workspace == null || workspace.length() > 50 * 1024 * 1024) {
      call.reject("Workspace payload is invalid");
      return;
    }

    try {
      if (!preferences().edit().putString(WORKSPACE_KEY, encrypt(workspace)).commit()) {
        call.reject("Unable to save secure workspace");
        return;
      }
      JSObject result = new JSObject();
      result.put("saved", true);
      call.resolve(result);
    } catch (Exception exception) {
      call.reject("Unable to save secure workspace", exception);
    }
  }

  @PluginMethod
  public void clear(PluginCall call) {
    if (!preferences().edit().remove(WORKSPACE_KEY).commit()) {
      call.reject("Unable to clear secure workspace");
      return;
    }
    call.resolve();
  }

  private SharedPreferences preferences() {
    return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
  }

  private String encrypt(String plaintext) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, secretKey());
    byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
    return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
  }

  private String decrypt(String encoded) throws Exception {
    String[] parts = encoded.split("\\.", -1);
    if (parts.length != 2) throw new IllegalArgumentException("Invalid encrypted workspace");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_LENGTH, Base64.decode(parts[0], Base64.NO_WRAP)));
    return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
  }

  private SecretKey secretKey() throws Exception {
    KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
    keyStore.load(null);
    if (keyStore.containsAlias(KEY_ALIAS)) {
      return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
    generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .build());
    return generator.generateKey();
  }
}
