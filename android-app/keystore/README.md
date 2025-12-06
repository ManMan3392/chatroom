请把你的 release keystore（`.jks`）放在本目录中。

- 示例命名：`my-release-key.jks`
- 该目录下的 `*.jks` 已在仓库根 `.gitignore` 中被忽略，请勿将 keystore 或密码提交到远程仓库。

生成 keystore 的示例命令（需要安装 JDK 并确保 `keytool` 在 PATH 中）：

```bash
keytool -genkeypair -v \
  -keystore android-app/keystore/my-release-key.jks \
  -alias my-key-alias \
  -keyalg RSA -keysize 2048 -validity 10000
```

建议把 `RELEASE_STORE_PASSWORD` 和 `RELEASE_KEY_PASSWORD` 写入你的用户级 `~/.gradle/gradle.properties` 或 CI 的 secret 中。
