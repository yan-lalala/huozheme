package com.huozheme.companion.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 手机重启广播监听器
 * 保证关机重启后系统自动把广播服务激活，无需用户重新打开 App
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == action ||
            "android.intent.action.QUICKBOOT_POWERON" == action) {
            Log.i(TAG, "手机开机完成！「活着么」守护伴侣已在后台就绪，等待今日首次屏幕解锁。")
        }
    }
}
