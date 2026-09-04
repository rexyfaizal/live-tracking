package com.rexy.livetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Setelah tablet dinyalakan, buka Live Tracker otomatis.
 * WebView akan lanjutkan sesi login + tracking jika masih tersimpan.
 */
public class BootReceiver extends BroadcastReceiver {
  private static final String TAG = "LiveTrackerBoot";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || intent.getAction() == null) {
      return;
    }

    String action = intent.getAction();
    boolean isBoot =
        Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action);

    if (!isBoot) {
      return;
    }

    Log.i(TAG, "Boot detected, launching MainActivity");

    Intent launch = new Intent(context, MainActivity.class);
    launch.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
    launch.putExtra("from_boot", true);

    try {
      context.startActivity(launch);
    } catch (Exception error) {
      Log.e(TAG, "Gagal auto-buka setelah boot", error);
    }
  }
}
