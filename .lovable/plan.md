## 现在真正的问题

你截图里有 3 个独立问题：

1. **`git pull` 拉不到**
   - 终端写得很清楚：
     ```text
     Your local changes to the following files would be overwritten by merge:
       src/routeTree.gen.ts
     ```
   - `src/routeTree.gen.ts` 是 TanStack Router 自动生成文件，不应该手动改，也不需要保留。

2. **Admin push notification 还是失败**
   - 现在错误已经变清楚了：
     ```text
     FCM_SERVICE_ACCOUNT_JSON is missing required fields
     (project_id, private_key, client_email)
     ```
   - 说明你刚才填的 `FCM_SERVICE_ACCOUNT_JSON` 不是 Firebase **service account private key JSON**。
   - 很多人会误填 `google-services.json`，但那个不是同一个东西，里面通常没有 `private_key` / `client_email`。

3. **APK logo 还是 Android 默认图标**
   - 因为你还没成功 `git pull`，所以我准备的 `public/app-icons/` 和 `generate-icons.bat` 还没到你本地。
   - 另外，即使拉到了，也必须运行生成脚本，把图标写进 `android/app/src/main/res/mipmap-*`，只改图片文件不会自动变 APK logo。

---

## 你本地现在按这个顺序做

### 第 1 步：先解决 git pull

在 Android Studio Terminal 里跑：

```powershell
git restore src/routeTree.gen.ts
git pull
```

如果你的 Git 比较旧，不支持 `git restore`，就用：

```powershell
git checkout -- src/routeTree.gen.ts
git pull
```

> 这只会丢掉 `src/routeTree.gen.ts` 这个自动生成文件的本地改动，不会删你的订单、图片、Android 项目。

---

### 第 2 步：更新 APK logo

`git pull` 成功后，运行我放进去的一键脚本：

```powershell
public\app-icons\generate-icons.bat
```

它会自动做这些事：

```text
copy public/app-icons/*.png → assets/
npm install -D @capacitor/assets
npx capacitor-assets generate --android
npx cap sync android
```

然后在 Android Studio：

```text
Build > Clean Project
Build > Rebuild Project
Build > Build APK
```

最后手机上一定要：

```text
卸载旧 Bossify app → 再安装新 APK
```

Android 会缓存旧 launcher icon，覆盖安装经常还是旧图标。

---

### 第 3 步：修 push notification secret

你需要重新拿 Firebase 的 **Service Account Private Key**，不是 `google-services.json`。

路径：

```text
Firebase Console
→ Project settings
→ Service accounts
→ Firebase Admin SDK
→ Generate new private key
```

下载出来的 JSON 应该长这样，必须有这些字段：

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...@....iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

然后把**整个 JSON 文件内容**重新填进 Lovable 的 `FCM_SERVICE_ACCOUNT_JSON` secret。

---

## 判断是否成功

成功后：

1. `git pull` 不再报 `routeTree.gen.ts`。
2. Android Studio 里 `res/mipmap-*` 的 `ic_launcher` 会变成 Bossify 图标。
3. 新 APK 必须卸载旧 app 后安装，桌面图标才会刷新。
4. 点击 `Send Test Push (Admin)` 不应该再出现 `missing required fields`。