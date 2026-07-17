package com.yuchen.onlinetestingaccount;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(LanApiPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
