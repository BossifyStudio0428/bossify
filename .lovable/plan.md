问题不是你打错命令，而是 `src/routeTree.gen.ts` 是自动生成文件；如果 Android Studio / VS Code / Lovable dev server 还在跑，它会在你 restore/delete 后马上重新生成，导致 `git pull` 仍然失败。

执行步骤：

1. 先停掉正在跑的开发服务
   - 在终端按 `Ctrl + C`
   - 如果有多个 terminal，都停掉
   - 关闭正在跑 `npm run dev` / `bun dev` / `vite` 的窗口

2. 在 PowerShell 执行强制丢弃这个生成文件的本地改动

```powershell
git checkout -- src/routeTree.gen.ts
```

如果上面还是不行，执行：

```powershell
git update-index --no-skip-worktree --no-assume-unchanged src/routeTree.gen.ts
git checkout -- src/routeTree.gen.ts
```

3. 再执行拉取

```powershell
git pull
```

4. pull 成功后，永久解决这个文件以后反复冲突的问题

```powershell
git rm --cached src/routeTree.gen.ts
git add .gitignore
git commit -m "Stop tracking generated route tree"
git push
```

5. 最后再重新启动项目

```powershell
npm run dev
```

或你平时用的启动命令。

如果第 2 步还是失败，把下面两条命令的输出发我，我再按你的真实 Git 状态给你一条准确命令：

```powershell
git status --short
git ls-files -s src/routeTree.gen.ts
```