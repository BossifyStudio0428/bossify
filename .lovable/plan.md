## 闪退根因（100% 确诊）

logcat 红字写得明明白白：
```
java.lang.ClassNotFoundException:
Didn't find class "com.zhstudio.bossify.MainActivity"
on path: DexPathList[[zip file ".../base.apk"]...]
```

翻译：APK 装上了，但 Android 启动 app 的瞬间，**找不到 `com.zhstudio.bossify.MainActivity` 这个类**——所以"打开就闪退"。

### 为什么找不到？

Capacitor 的 `AndroidManifest.xml` 里写的是 `android:name=".MainActivity"`，配合 `package="com.zhstudio.bossify"`，Android 会去找文件：
```
android/app/src/main/java/com/zhstudio/bossify/MainActivity.java
```

但你这个 APK 里**这个文件根本不存在**。3 种最常见的原因（按概率排序）：

1. **`MainActivity.java` 还在旧包路径下**（最常见）——比如 `android/app/src/main/java/io/ionic/starter/MainActivity.java`，appId 改了之后没把 .java 文件搬过去。
2. **`build.gradle` 里 `applicationId` 和 `namespace` 不一致**——一个是 `com.zhstudio.bossify`，另一个还是旧值，导致编译出来的 class 包名不对。
3. **代码混淆/缩减把 MainActivity 删了**——`minifyEnabled true` + 没配 ProGuard 规则。

## 修复步骤（你在电脑上做，每步都简单）

### 第 1 步：找出 MainActivity.java 真正在哪

在 PowerShell 跑：
```powershell
cd C:\dev\bossify
Get-ChildItem -Path android\app\src\main\java -Recurse -Filter "MainActivity.java"
```

把输出贴给我。会有 3 种可能的结果：
- **A**：路径是 `...\java\com\zhstudio\bossify\MainActivity.java` ✅ 位置正确，去看第 2 步
- **B**：路径是 `...\java\io\ionic\starter\MainActivity.java`（或其他旧包名） → 包名错位，要修
- **C**：找不到任何 MainActivity.java → Capacitor 项目损坏，要重新生成 android 文件夹

### 第 2 步：检查 build.gradle 的 applicationId / namespace

```powershell
Get-Content android\app\build.gradle | Select-String -Pattern "applicationId|namespace"
```

正确应该是：
```
namespace "com.zhstudio.bossify"
applicationId "com.zhstudio.bossify"
```
两个都必须是 `com.zhstudio.bossify`。

### 第 3 步：根据上面的结果，做下面三种修复之一

#### 修复方案 A — 包名错位（最常见，很可能就是你的情况）

最快的办法：**直接重新生成整个 android 文件夹**。脚本 `npm run android:reset` 会做这事（从 `scripts/reset-android.ps1` 看应该已经写好了）。

```powershell
cd C:\dev\bossify
git pull                                    # 先确保拿到最新脚本
npm run android:reset                       # 删掉 android/ 重新生成
bun run build                               # 重新 build 网页
npx cap sync android                        # 同步进新 android/
npm run android:patch                       # 应用我们的 manifest 补丁
```

然后**用 Android Studio 重新打 APK**，装到手机，应该就不闪退了。

#### 修复方案 B — 升级 patch-android.mjs，让它**自动确保** MainActivity.java 在正确路径

如果方案 A 跑完还是闪退，我会改 `scripts/patch-android.mjs`，让它每次跑完自动：
1. 检查 `android/app/src/main/java/com/zhstudio/bossify/MainActivity.java` 是否存在
2. 如果不存在，自动从旧路径搬过来（或自动生成一个标准的 Capacitor MainActivity.java）
3. 检查 `build.gradle` 的 `namespace` / `applicationId` 是否都是 `com.zhstudio.bossify`，不对就改对

这样以后**永远不会再踩这个坑**。

#### 修复方案 C — 找不到 MainActivity.java

完全删 android 文件夹重来：
```powershell
Remove-Item -Recurse -Force android
npx cap add android
npm run android:patch
```

## 我现在不动任何代码

这一轮**只**给你诊断和修复路径。等你跑完第 1、2 步，把结果贴给我，我才会动 `scripts/patch-android.mjs`，做精准的"自动修包名"逻辑。这样不会瞎改，也不会浪费 credit。

## 你现在要做的

1. 在 PowerShell 跑第 1 步那个 `Get-ChildItem` 命令
2. 跑第 2 步那个 `Get-Content ... Select-String` 命令
3. 把这两个命令的输出贴给我

不到 30 秒，然后我立刻给你最终修复。
