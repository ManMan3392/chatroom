package com.example.hybridchat

import android.content.Context
import android.os.Build
import android.content.Intent
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import android.media.MediaRecorder

class WebAppInterface(private val mContext: Context) {
    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null

    /**
     * 获取设备信息
     * @return 设备型号和系统版本
     */
    @JavascriptInterface
    fun getDeviceInfo(): String {
        return "Model: ${Build.MODEL}, OS: ${Build.VERSION.RELEASE}"
    }

    /**
     * 显示原生 Toast 提示
     * @param toast 提示内容
     */
    @JavascriptInterface
    fun showToast(toast: String) {
        Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show()
    }

    /**
     * 发送本地通知
     */
    @JavascriptInterface
    fun showNotification(title: String, message: String) {
        if (mContext is MainActivity) {
            mContext.showNotification(title, message)
        }
    }

    /**
     * 开始录音 (Native)
     */
    @JavascriptInterface
    fun startAudioRecording(): Boolean {
        try {
            audioFile = File(mContext.cacheDir, "audiorecord.m4a")
            if (audioFile?.exists() == true) {
                audioFile?.delete()
            }

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(mContext)
            } else {
                MediaRecorder()
            }

            mediaRecorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(audioFile?.absolutePath)
                prepare()
                start()
            }
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }

    /**
     * 停止录音并返回 Base64 数据 (Native)
     */
    @JavascriptInterface
    fun stopAudioRecording(): String? {
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
            mediaRecorder = null

            if (audioFile != null && audioFile!!.exists()) {
                val bytes = audioFile!!.readBytes()
                val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                return "data:audio/mp4;base64,$base64"
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    /**
     * 从 Web 前端调用，启动原生视频播放页面
     * @param url 视频的可访问 URL（可以是 http(s) 或 本地文件路径）
     */
    @JavascriptInterface
    fun playVideo(url: String) {
        // First try to open the in-app native player activity.
        try {
            val intent = Intent(mContext, VideoPlayerActivity::class.java)
            intent.putExtra("video_url", url)
            if (mContext !is android.app.Activity) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            mContext.startActivity(intent)
            return
        } catch (e: Exception) {
            // Fall through to external player fallback
        }

        // Fallback: try to open with an external video player using ACTION_VIEW
        try {
            val viewIntent = Intent(Intent.ACTION_VIEW)
            viewIntent.setDataAndType(android.net.Uri.parse(url), "video/*")
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            mContext.startActivity(viewIntent)
        } catch (e: Exception) {
            // If launching external player with a remote URI fails, try downloading the file
            // into cache and open via FileProvider so external apps can read it.
            Thread {
                try {
                    val tmpName = "video_${System.currentTimeMillis()}.mp4"
                    val outFile = File(mContext.cacheDir, tmpName)
                    val urlObj = URL(url)
                    urlObj.openStream().use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }

                    val contentUri: Uri = FileProvider.getUriForFile(mContext, "${mContext.packageName}.fileprovider", outFile)
                    val intent = Intent(Intent.ACTION_VIEW)
                    intent.setDataAndType(contentUri, "video/*")
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    mContext.startActivity(intent)
                } catch (ex: Exception) {
                    // Show toast on main thread
                    android.os.Handler(mContext.mainLooper).post {
                        Toast.makeText(mContext, "无法启动播放器，请检查视频 URL 或设备环境", Toast.LENGTH_LONG).show()
                    }
                }
            }.start()
        }
    }
}
