# Hybrid Chat App 技术文档

## 1. 项目简介

本项目是一个 **混合开发 (Hybrid Development)** 的实时聊天应用演示。它展示了如何通过 Web 技术构建跨平台界面，并利用 Android 原生能力增强 Web 应用的功能。

项目包含三个核心部分：

1.  **Node.js 后端**：提供 WebSocket 服务和静态资源托管。
2.  **Web 前端**：基于 HTML/JS 的聊天界面，适配 PC 浏览器和移动端 WebView。
3.  **Android 原生壳**：使用 Kotlin 编写，通过 WebView 加载前端，并提供 JS Bridge (JS 与原生交互通道)。

## 2. 技术栈

- **后端**: Node.js, Express, ws (WebSocket 库)
- **前端**: HTML5, CSS3, Vanilla JavaScript (原生 JS)
- **移动端**: Android (Kotlin), WebView, Gradle
- **通信协议**: WebSocket (实时通信), JavascriptInterface (混合开发桥接)

## 3. 系统架构与功能实现

### 3.1 实时聊天功能 (WebSocket)

- **原理**: 前端通过 WebSocket 协议与 Node.js 服务器建立长连接。
- **流程**:
  1.  客户端发送消息 -> 服务器接收。
  2.  服务器遍历所有连接的客户端 -> 广播消息。
  3.  客户端收到消息 -> 更新 DOM 显示。
- **网络适配**:
  - 前端代码 (`main.js`) 动态获取 `window.location.hostname`，从而在 localhost 环境和局域网 IP 环境下都能正确连接 WebSocket。
  - 服务器监听 `0.0.0.0`，允许局域网内其他设备（如 Android 模拟器/真机）访问。

### 3.2 混合开发桥接 (JS Bridge)

Android 原生代码通过 `addJavascriptInterface` 向 WebView 注入一个名为 `AndroidNative` 的全局对象。前端 JS 可以直接调用该对象的方法。

- **已实现接口**:
  - `AndroidNative.showToast(String message)`: 调用 Android 原生的 Toast 提示框。
  - `AndroidNative.getDeviceInfo()`: 获取 Android 设备型号信息。
  - `AndroidNative.*` 也被用于在 Web 与原生间传递结果（例如原生录音接口或其他扩展）。

### 3.3 摄像头与拍摄支持（新增）

本项目新增了在 Web 前端内请求相机权限并拍照的实现，以及相应的 Android 原生权限声明与运行时申请。

- 前端（`web-frontend-react`）

  - 在 `src/components/InputArea.jsx` 中新增了相机模态框与两个核心函数：`startCamera`（通过 `navigator.mediaDevices.getUserMedia` 请求相机流并显示预览）和 `takePhoto`（从 `<video>` 捕获帧，生成 `Blob` → `File`，并调用 `uploadFile` 上传后发送消息）。
  - 在 `src/index.css` 中新增了 `.camera-modal`, `.camera-video`, `.camera-controls` 等样式用于全屏预览与拍摄按钮样式。
  - 拍摄流程会先在浏览器/WebView 中请求相机权限；用户允许后显示预览，拍照后会把图片上传并通过聊天消息发送。

- Android 原生（`android-app`）

  - 在 `AndroidManifest.xml` 中添加了相机权限声明：

    ```xml
    <uses-permission android:name="android.permission.CAMERA" />
    ```

  - 在 `MainActivity.kt` 的 `checkPermissions` 中添加了对 `Manifest.permission.CAMERA` 的运行时检查与申请（基于 `ActivityResultContracts.RequestMultiplePermissions`）。
  - `WebChromeClient.onPermissionRequest` 在当前实现中会调用 `request.grant(request.resources)`，从而允许 WebView 的媒体权限请求（在安全场景下这样可以让 Web 请求到摄像头/麦克风流）。

注意：Android 权限的变更需要重新编译并安装 APK 才能生效；仅刷新网页无法触发原生权限声明。

- **调用时机**:
  - 前端在 WebSocket 连接成功后，会自动检测是否存在 `window.AndroidNative` 对象。
  - 如果存在，则自动获取设备信息并显示在聊天窗口，同时弹出原生 Toast 提示“连接成功”。

## 4. 项目结构说明

```text
d:\byteDanceHomework\class3\
├── server/                 # 后端代码
│   └── index.js            # WebSocket 服务器入口，静态文件服务
├── web-frontend/           # 前端代码
│   ├── index.html          # 聊天主页
│   ├── style.css           # 样式表
│   └── main.js             # 聊天逻辑 & JS Bridge 调用
├── android-app/            # Android 工程
│   ├── app/src/main/java/com/example/hybridchat/
│   │   ├── MainActivity.kt     # 安卓主入口，配置 WebView
│   │   └── WebAppInterface.kt  # 定义暴露给 JS 的原生方法
│   ├── build.gradle        # 项目构建配置
│   └── ...
└── README.md               # 本文档
```

## 5. 关键代码解析

### 5.1 Android WebView 配置 (`MainActivity.kt`)

```kotlin
// 启用 JS 支持
myWebView.settings.javaScriptEnabled = true

// 注入 JS 对象，前端通过 window.AndroidNative 访问
myWebView.addJavascriptInterface(WebAppInterface(this), "AndroidNative")

// 错误处理：加载失败时弹出 Toast
myWebView.webViewClient = object : WebViewClient() {
    override fun onReceivedError(...) { ... }
}

// 加载局域网地址 (需根据实际 IP 修改)
myWebView.loadUrl("http://172.22.160.111:3000")
```

### 5.2 前端动态连接 (`main.js`)

```javascript
// 自动适配当前访问的主机名 (localhost 或 IP)
const wsUrl = `ws://${window.location.hostname}:3000`;
const ws = new WebSocket(wsUrl);

// 检测并调用原生能力
if (window.AndroidNative) {
  const info = window.AndroidNative.getDeviceInfo();
  window.AndroidNative.showToast("Hybrid Chat 连接成功！");
}
```

## 6. 使用与运行指南

### 6.1 环境准备

- Node.js (v14+)
- Android Studio (推荐最新版)
- JDK 17+ (用于 Android 构建)

### 6.2 启动后端

在项目根目录打开终端：

```bash
node server/index.js
```

### 6.4 在浏览器与移动端测试摄像头与拍照功能

1. web 浏览器 (桌面或手机浏览器)

- 打开前端页面（例如 `http://localhost:5173` 或部署后的地址）。
- 在聊天页点击 `+` → `拍摄`，浏览器会弹出相机权限请求。允许后会显示预览并可拍照、发送。

2. Android 真机（WebView）

- 需要先重新构建并安装 Android App：

  ```bash
  # 在 android-app 目录下构建并安装（示例：使用 Gradle/Android Studio）
  # 使用命令行（可能需要配置 ANDROID_HOME）
  cd android-app
  ./gradlew assembleDebug
  # 然后通过 adb 安装生成的 APK（示例路径）：
  adb install -r app/build/outputs/apk/debug/app-debug.apk
  ```

- 第一次运行 App 时系统会弹出权限请求（相机/录音等），请允许。
- 打开聊天页面，点击 `+` → `拍摄`。WebView 会请求媒体权限并在已授予后显示内置相机预览。拍照后图片会被上传并发送为聊天消息。

3. 常见问题

- 如果在 WebView 中没有弹出权限请求，确认 App 已包含 `CAMERA` 权限且 `MainActivity.kt` 已在运行时申请权限（见 `checkPermissions`）。
- 真机测试时，确保 URL 使用可访问的地址（局域网 IP 或线上地址），因为设备上的 WebView 需要能够访问前端资源与后端上传接口。

_输出提示：服务器正在监听端口 3000_
