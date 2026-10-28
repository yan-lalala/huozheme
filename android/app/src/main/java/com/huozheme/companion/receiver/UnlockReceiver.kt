package com.huozheme.companion.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * 屏幕解锁广播监听器
 * 当手机屏幕被指纹/人脸/密码解开时，由 Android 操作系统直接派发
 */
class UnlockReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "UnlockReceiver"
        const val PREFS_NAME = "huozheme_prefs"
        const val KEY_TOKEN = "device_token"
        const val KEY_SERVER = "server_url"
        const val KEY_LAST_DATE = "last_checkin_date"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (Intent.ACTION_USER_PRESENT != intent.action) {
            return
        }

        Log.d(TAG, "检测到手机解锁事件 (ACTION_USER_PRESENT)!")

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_TOKEN, null)
        val serverUrl = prefs.getString(KEY_SERVER, "http://10.0.2.2:3000") // 默认本地开发地址

        if (token.isNullOrEmpty()) {
            Log.w(TAG, "尚未绑定用户 Token，忽略本次打卡")
            return
        }

        val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val lastDate = prefs.getString(KEY_LAST_DATE, "")

        // 核心防刷机制：如果今天已经打过卡了，直接休眠退出，完全零耗电、零网络请求
        if (todayDate == lastDate) {
            Log.d(TAG, "今日 [$todayDate] 已完成打卡，保持静默休眠")
            return
        }

        Log.i(TAG, "今日首次解锁，准备静默向云端发送平安报到...")

        // 在轻量工作线程中发送单次 HTTP GET 请求
        thread {
            var connection: HttpURLConnection? = null
            try {
                val fullUrl = "$serverUrl/api/v1/ping?token=$token"
                val url = URL(fullUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 8000
                connection.readTimeout = 8000
                connection.setRequestProperty("User-Agent", "Huozheme-Android-Companion/1.0")

                val responseCode = connection.responseCode
                if (responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(connection.inputStream))
                    val response = reader.readText()
                    reader.close()
                    Log.i(TAG, "打卡成功！服务端响应: $response")

                    // 写入本地缓存，确保今天之内不再重复打卡
                    prefs.edit().putString(KEY_LAST_DATE, todayDate).apply()
                } else {
                    Log.e(TAG, "打卡请求失败，HTTP 状态码: $responseCode")
                }
            } catch (e: Exception) {
                Log.e(TAG, "网络异常无法发送打卡: ${e.message}")
            } finally {
                connection?.disconnect()
            }
        }
    }
}
