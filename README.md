# Hybrid Chat App 技术文档

## 1. 项目简介

一个 **混合开发 (Hybrid Development)** 的实时聊天应用。样式主要模仿的微信，实现：id登陆账号，推送app及浏览器消息，获取麦克风、摄像头权限发送语音和拍照发送，视频及图片发送，多人群聊，聊天记录持久化及滑动懒加载等要求的所有内容。

项目包含三个核心部分：

1.  **Node.js 后端**：提供 WebSocket 服务和静态资源托管，连接远程数据库。
2.  **Web 前端**：基于 react 的聊天界面。
3.  **Android 原生壳**：使用 Kotlin 编写，通过 WebView 加载前端，并提供 JS Bridge。

## 2. 技术栈

- **后端**: Node.js, Express, ws
- **前端**: react+less+vite
- **移动端**: Android (Kotlin), WebView, Gradle
- **通信协议**: WebSocket, JavascriptInterface

## 项目地址
- GitHub:https://github.com/ManMan3392/chatroom.git
- 线上地址：https://chatroomwebview.onrender.com
- 安卓安装包见附件

## 注意事项
1. 本项目使用render免费套餐部署，所以有时候服务器会在无操作时进入休眠状态，所以第一次进入可能会在render页面加载很久。
2. 本项目视频及图片资源都存储在服务器上，所以发送和接受可能会有点慢，要稍等一下。
3. 因为render会时不时进入休眠状态，而静态资源保存在服务器上，会导致下一次从休眠状态恢复时图片及视频都不可见，保存在数据库里的聊天记录不受影响。
4. **考虑到以上服务器加载问题，我录制了一个视频，见附件。**
