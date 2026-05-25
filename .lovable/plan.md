## 修复 `team_members` 无限递归

### 根本原因
上一轮把 `public.can_access_user_data(uuid)` 改成了 `SECURITY INVOKER`。该函数内部 `JOIN team_members tm1 JOIN team_members tm2`，作为 invoker 执行时会触发 `team_members` 表的 RLS，而 RLS 又会评估引用同一张表的策略 → Postgres 报 `infinite recursion detected in policy for relation "team_members"`。

inventory / orders / customers / follow_ups / services 的 SELECT 策略都依赖这个函数，所以每个页面都炸。

### 修复
在外部 Supabase（`knouahqwazerjiyiqgmh`，通过 `EXTERNAL_SUPABASE_DB_URL` 用 psql 执行，不走 Lovable Cloud 迁移工具）运行：

```sql
CREATE OR REPLACE FUNCTION public.can_access_user_data(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER          -- ← 关键：恢复 DEFINER，绕过内部查询的 RLS
SET search_path = public
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL OR target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF _actor_id = target_user_id THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = _actor_id
      AND tm2.user_id = target_user_id
      AND tm1.status = 'active'
      AND tm2.status = 'active'
  );
END;
$$;

-- 保留之前修好的权限（避免 anon 评估时 "permission denied"）
REVOKE ALL ON FUNCTION public.can_access_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid)
  TO anon, authenticated, service_role;
```

### 验证
1. 用一个真实用户的 JWT 在 psql 里 `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '...';` 然后 `SELECT * FROM inventory LIMIT 1;` —— 不应再报递归。
2. 刷新 `/inventory`、`/orders`、`/customers` 页面，红色 toast 消失。

### 为什么这次不会再有 "permission denied"
那个报错来自 `anon` 评估策略时缺 EXECUTE 权限；保留 `GRANT EXECUTE ... TO anon` 已经覆盖。`SECURITY DEFINER` 并不影响调用者是否被允许 EXECUTE，它只影响函数体里的查询以谁的身份运行。两件事互不冲突。

### 不需要改动的内容
- 应用代码（routes / functions / client）保持不变。
- 其它表的 RLS 策略不动。
- 不创建新迁移文件（Lovable Cloud 迁移会落到错的数据库），直接对外部库执行 SQL。
