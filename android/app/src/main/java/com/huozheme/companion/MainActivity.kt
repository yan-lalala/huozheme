package com.huozheme.companion

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.huozheme.companion.receiver.UnlockReceiver
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etToken: EditText
    private lateinit var tvStatus: TextView
    private lateinit var btnSave: Button
    private lateinit var btnTest: Button
    private lateinit var btnBattery: Button

    @SuppressLint("BatteryLife")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etServerUrl = findViewById(R.id.etServerUrl)
        etToken = findViewById(R.id.etToken)
        tvStatus = findViewById(R.id.tvStatus)
        btnSave = findViewById(R.id.btnSave)
        btnTest = findViewById(R.id.btnTest)
        btnBattery = findViewById(R.id.btnBattery)

        val prefs = getSharedPreferences(UnlockReceiver.PREFS_NAME, Context.MODE_PRIVATE)
        val savedServer = prefs.getString(UnlockReceiver.KEY_SERVER, "https://huozheme-9yrv.onrender.com")
        val savedToken = prefs.getString(UnlockReceiver.KEY_TOKEN, "")

        etServerUrl.setText(savedServer)
        etToken.setText(savedToken)

        updateStatusText()

        // 保存设置
        btnSave.setOnClickListener {
            val server = etServerUrl.text.toString().trim()
            val token = etToken.text.toString().trim()
            if (token.isEmpty()) {
                Toast.makeText(this, "请输入或粘贴微信小程序中的设备 Token", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.edit()
                .putString(UnlockReceiver.KEY_SERVER, server)
                .putString(UnlockReceiver.KEY_TOKEN, token)
                .apply()
            Toast.makeText(this, "设置已保存！从现在起屏幕解锁将自动打卡", Toast.LENGTH_SHORT).show()
            updateStatusText()
        }

        // 测试打卡
        btnTest.setOnClickListener {
            val server = etServerUrl.text.toString().trim()
            val token = etToken.text.toString().trim()
            if (token.isEmpty()) {
                Toast.makeText(this, "请先填写 Token", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            thread {
                try {
                    val url = URL("$server/api/v1/ping?token=$token")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000
                    val code = conn.responseCode
                    runOnUiThread {
                        if (code == 200) {
                            Toast.makeText(this, "测试成功！云端已记录平安打卡", Toast.LENGTH_LONG).show()
                            updateStatusText()
                        } else {
                            Toast.makeText(this, "连接失败，HTTP 状态: $code", Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        Toast.makeText(this, "连接失败: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        // 电池优化白名单申请
        btnBattery.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "已处于电池优化白名单中，防杀配置正常！", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun updateStatusText() {
        val prefs = getSharedPreferences(UnlockReceiver.PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(UnlockReceiver.KEY_TOKEN, "")
        val lastDate = prefs.getString(UnlockReceiver.KEY_LAST_DATE, "无")

        if (token.isNullOrEmpty()) {
            tvStatus.text = "状态：⚪ 尚未绑定 Token"
        } else {
            tvStatus.text = "状态：🟢 守护中 (最近打卡日期: $lastDate)"
        }
    }
}
