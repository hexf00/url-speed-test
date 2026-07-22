# URL Speed Test 交付工作流

仓库中的产品变更使用同一条路径：从最新 `origin/main` 建立任务分支与 sibling
worktree，在任务 worktree 中完成实现和验证，通过 Draft PR 交付，取得明确合入授权
后 squash merge，并在更新后的 `main` 上复验。

## 进入任务工作区后

### 检查动作

1. 报告绝对工作目录、分支、HEAD 和 `git status`。
2. 执行 `git fetch origin`，确认任务 HEAD 包含最新 `origin/main`。
3. 在独立任务分支和 sibling worktree 中工作；默认 `main` worktree 保持干净。
4. 阅读 `CONTEXT.md`、相关 ADR、`README.md` 和本文件。

### 通过条件

任务 worktree 基于最新 `origin/main`，分支和工作目录明确，默认 worktree 干净。

## 修改前

### 检查动作

1. 写明当前行为、目标行为、owning layer、唯一成功路径和验证方式。
2. 确认产品路径保持为 `Target -> Run -> Result`。
3. 确认新增依赖确有必要，浏览器标准能力优先承担浏览器职责。

### 通过条件

变更合同具有一个 owner、一条成功路径和能够证明目标行为的验证。

## 提交 PR 前

### 检查动作

1. 将最新 `origin/main` merge 到任务分支，保留已推送历史。
2. 执行：

   ```bash
   npm ci
   npm test
   npm run check
   git diff --check
   ```

3. 执行与本次用户路径对应的真实浏览器 smoke。
4. 审查完整 diff、提交列表和工作区状态。
5. Draft PR 正文记录目标、owner、成功路径、长期正确性、验证命令与结果。

### 通过条件

当前 PR HEAD 基于最新主线，自动化检查和浏览器 smoke 通过，工作区干净，Draft PR
提供完整证据。

## 转为 Ready 前

### 检查动作

1. 解决全部 review blocker。
2. 确认 CI 与本地证据对应当前 PR HEAD。
3. 取得用户对当前 PR 的明确合入授权。

### 通过条件

用户已授权合入，review 结论为通过，全部检查对应当前 HEAD。

## 合入前

### 检查动作

1. 确认 PR、head commit、mergeability 和 required checks。
2. 标记 Ready，并使用保留 PR 编号的标题完成 squash merge。
3. 删除远端任务分支。

### 通过条件

PR 已 squash merge，主线提交可追溯，远端任务分支已删除。

## 合入后

### 检查动作

1. fast-forward 更新默认 `main` worktree。
2. 在 `main` 上重新执行 `npm ci`、`npm test`、`npm run check` 和浏览器 smoke。
3. 删除已完成的任务 worktree 和本地任务分支。

### 通过条件

本地 `main` 与 `origin/main` 一致，集成验证通过，任务 worktree 和分支已清理。
