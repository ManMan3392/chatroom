package com.example.hybridchat

import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.view.Surface
import android.view.TextureView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class VideoPlayerActivity : AppCompatActivity(), TextureView.SurfaceTextureListener {

    private var mediaPlayer: MediaPlayer? = null
    private var pendingUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_video_player)

        val textureView: TextureView = findViewById(R.id.video_texture)
        textureView.surfaceTextureListener = this

        pendingUrl = intent.getStringExtra("video_url")
        if (pendingUrl == null) {
            Toast.makeText(this, "No video URL provided", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun startPlayback(surface: Surface) {
        val url = pendingUrl ?: return
        try {
            releasePlayer()
            mediaPlayer = MediaPlayer().apply {
                setSurface(surface)
                setDataSource(this@VideoPlayerActivity, Uri.parse(url))
                setOnPreparedListener { mp ->
                    try {
                        mp.start()
                    } catch (e: Exception) {
                        Toast.makeText(this@VideoPlayerActivity, "Playback start failed", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                }
                setOnErrorListener { _, what, extra ->
                    Toast.makeText(this@VideoPlayerActivity, "Playback error: $what", Toast.LENGTH_LONG).show()
                    finish()
                    true
                }
                prepareAsync()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Invalid video URL or cannot play this format", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun releasePlayer() {
        try {
            mediaPlayer?.stop()
        } catch (_: Exception) {
        }
        mediaPlayer?.release()
        mediaPlayer = null
    }

    override fun onDestroy() {
        super.onDestroy()
        releasePlayer()
    }

    // TextureView.SurfaceTextureListener
    override fun onSurfaceTextureAvailable(surfaceTexture: android.graphics.SurfaceTexture, width: Int, height: Int) {
        val surface = Surface(surfaceTexture)
        startPlayback(surface)
    }

    override fun onSurfaceTextureSizeChanged(surface: android.graphics.SurfaceTexture, width: Int, height: Int) {}

    override fun onSurfaceTextureDestroyed(surface: android.graphics.SurfaceTexture): Boolean {
        releasePlayer()
        return true
    }

    override fun onSurfaceTextureUpdated(surface: android.graphics.SurfaceTexture) {}
}
