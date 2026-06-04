## 真正问题

你截图里的新错误是：

```text
Copied .output/public -> dist/client
Could not find tanstack start manifest in dist/server.
```

也就是说你的电脑上 `npm run build` 产物是：

```text
.output/public/assets/...
```

不是我上次假设的：

```text
dist/server/_tanstack-start-manifest...
```

所以脚本复制 web files 成功了，但下一步又去找不存在的 `dist/server`，导致失败。

## 这次修法

### 1. 改 `scripts/generate-spa-html.mjs`

不再依赖 `dist/server` manifest。

新逻辑：

```text
1. 清理旧 dist/client
2. 从 .output/public 复制到 dist/client
3. 在 dist/client/assets 里找最新的：
   - index-*.js 作为 app 入口
   - *.css 作为样式
4. 写入 dist/client/index.html
5. 验证这些文件真的存在，不存在就直接报清楚错误
```

这样就跟你电脑截图里的实际 build output 对上了。

### 2. 更新命令说明

保留你要的手动 Google Play 流程：

```bash
git pull
npm install
npm run android:prep
npx cap sync android
npm run android:patch
```

然后才去 Android Studio 打 APK/AAB。

### 3. 加防旧包机制

脚本每次都会先删除旧的 `dist/client`，再从 `.output/public` 复制新的，避免 `npx cap sync android` 拿到上一次的旧 assets。

## 验证

我会在这边验证：

```text
dist/client/index.html 存在
index.html 里引用的 /assets/index-*.js 存在
index.html 里引用的 /assets/*.css 存在
```

你本机跑完后再跑：

```bash
npx cap sync android
```

就不会再出现 `dist/client` 或 `dist/server` 的错误。