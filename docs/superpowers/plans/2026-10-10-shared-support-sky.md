# 共享微光星空 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在共和小学支教行动网站加入访客可留言、全站共享的线上星星支持墙，保留旧系统的点星、飞入、浏览玩法，不接收善款。

**Architecture:** 支持章节打开独立星空弹层；原生前端保留画布与飞星效果。Supabase 用专属 `support_stars` 表共享预设方向、最多 60 字留言和星星坐标；共享失败时明确标为本机星。

**Tech Stack:** 原生 HTML、CSS、JavaScript；Supabase JavaScript v2 浏览器 SDK；PostgreSQL RLS；Python `unittest`。

**Spec:** `docs/superpowers/specs/2026-10-10-shared-support-sky-design.md`

## Global Constraints

- 只使用三个固定方向：`特色课程`、`家庭走访`、`物资准备`。
- 留言长度为 1–60 字，不收集访客昵称；点亮前明确说明留言会公开，并提醒不写任何人的真实姓名、联系方式、住址或儿童可识别信息。
- 保留星空、星星飞入、点击查看和共享新星；动效关闭后仍能操作。
- 旧 `donation_stars` 表不用于新功能；移除金额、支付方式、模拟订单和支付凭证。
- 留言只以纯文本显示；网站不含 Supabase 服务端密钥。
- RLS 仅允许匿名读取和新增符合约束的星星，不允许匿名修改或删除。
- 共享失败的本机星必须清楚标注，不能算入共享数量。
- 不引入前端框架；保留现有学校、行程、课表、联系入口和“不收款”说明。

## Review Focus

- HTML 特殊字符或脚本片段作为留言时只能显示为文字：Task 3 测试 `test_support_message_is_rendered_as_plain_text`。
- 空白留言、超长留言及中英文混排必须由前端和数据库按同一规则拒绝：Task 1 测试 `test_support_star_schema_constrains_message_length_and_fields`，Task 3 测试 `test_support_form_rejects_invalid_messages`。
- 写入超时后的乐观飞星不得冒充共享星：Task 3 测试 `test_failed_publish_is_local_only_and_not_counted`。
- 首次快照和实时订阅返回同一 `client_id` 时只显示一颗：Task 3 测试 `test_snapshot_and_realtime_deduplicate_by_client_id`。
- 用户关闭动效或键盘操作弹层时，点星功能仍完整且焦点可返回入口：Task 2 测试 `test_support_dialog_has_keyboard_and_reduced_motion_support`，Task 3 浏览器验收。

---

### Task 1: 建立共享星星数据表

**Files:**
- Create: `tests/test_support_stars.py`
- Create: `supabase/support_stars.sql`
- Create: `supabase-config.js`

**Interfaces:** `window.WEIGUANG_SUPABASE_CONFIG` 提供 `url` 和浏览器可公开的 `publishableKey`；服务端密钥不得进入仓库。

- [x] **Step 1: 先写表结构测试** `test_support_star_schema_is_separate_and_read_insert_only`、`test_support_star_schema_constrains_message_length_and_fields`。断言只创建 `support_stars`，方向白名单固定为三个值，留言非空且不超过 60 字、坐标有范围，启用 RLS，仅授予匿名 select/insert；不含金额、昵称、联系方式或匿名 update/delete 策略。
- [x] **Step 2: 跑新增测试确认失败**：`python3 -m unittest discover -s tests -p test_support_stars.py -v`。预期因迁移文件尚不存在而失败。
- [x] **Step 3: 实现迁移与浏览器配置**：建表字段 `id, client_id, support_type, message, x, y, created_at`；限制匿名 insert 的列，不允许客户端自填 `id` 或时间；添加只读和新增 RLS policy，并把表加入 Realtime publication。配置使用旧共享星空草稿的 Supabase URL 与 publishable key。
- [x] **Step 4: 重跑新增测试及 `git diff --check`**，预期通过。
- [x] **Step 5: 提交本任务**，提交信息 `feat: add shared support stars schema`。

### Task 2: 添加星空入口与可访问弹层

**Files:**
- Modify: `index.html`
- Create: `support-stars.css`
- Create: `assets/night-sky.jpg`
- Modify: `tests/test_support_stars.py`

**Interfaces:** `#support-stars-dialog` 原生 `<dialog>`；入口 `data-support-stars-open`；关闭控件 `data-support-stars-close`；方向选项 `data-support-type`；留言 `#support-star-message`，`maxlength="120"`（最多 60 个 Unicode 字符）；公开确认 `#support-star-public-confirm`。

- [x] **Step 1: 先写页面契约测试** `test_support_dialog_discloses_public_message_and_confirmation`、`test_support_dialog_has_keyboard_and_reduced_motion_support`。断言有三个方向、留言 `maxlength="120"`、计数和校验都按不超过 60 个 Unicode 字符、公开提醒与必选确认、返回/关闭按钮、状态播报区域、支付与捐款订单表单缺席。
- [x] **Step 2: 跑新增测试确认失败**：`python3 -m unittest discover -s tests -p test_support_stars.py -v`。预期当前首页尚无星空弹层而失败。
- [x] **Step 3: 实现弹层结构和样式**：用 `showModal()` 打开；原生 Esc 关闭，保存并恢复入口焦点；适配桌面双栏与手机纵向布局；从用户桌面原系统素材复制 `night-sky.jpg`，保留原有夜空视觉。
- [x] **Step 4: 重跑页面契约测试及完整 HTML 本地资源检查**，预期通过且 CSS 对比度、减少动态效果规则有效。
- [x] **Step 5: 提交本任务**，提交信息 `feat: add support sky dialog`。

### Task 3: 实现共享、留言与飞星玩法

**Files:**
- Create: `support-stars.js`
- Modify: `index.html`
- Modify: `support-stars.css`
- Modify: `tests/test_support_stars.py`

**Interfaces:** 脚本用 `window.supabase.createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`。只读写 `support_stars` 字段 `client_id, support_type, message, x, y`；星星集合按 `client_id` 去重，最多展示最新 80 条。

- [x] **Step 1: 先写行为契约测试** `test_support_script_preserves_flight_and_shared_star_selection`、`test_support_message_is_rendered_as_plain_text`、`test_support_form_rejects_invalid_messages`、`test_failed_publish_is_local_only_and_not_counted`、`test_snapshot_and_realtime_deduplicate_by_client_id`。断言共享接口与允许字段一致、留言以 `textContent` 显示、失败状态明确、本机星不增加共享数、动画与点击查看逻辑保留。
- [x] **Step 2: 跑新增测试确认失败**：`python3 -m unittest discover -s tests -p test_support_stars.py -v`。预期因星空脚本尚不存在或缺少上述交互而失败。
- [x] **Step 3: 实现前端行为**：校验 trim 后留言的 Unicode 字符数为 1–60 且已确认公开；以随机 `client_id` 写入专用表；绘制静态星点、已发布星、悬停/点击提示和从确认按钮飞入的弧线动画；实时订阅并按 `client_id` 合并快照/新增，断线重连时重新读取最新快照；Supabase 未加载、未配置或不可用时保存并标示“仅本机可见，未同步到共享星空”。提示框使用 `textContent`，不使用 `innerHTML`；减少动态效果时直接完成点亮状态。
- [x] **Step 4: 载入 Supabase SDK、配置和 `support-stars.js`，确认顺序为 SDK → 配置 → 页面主脚本/星空脚本；重跑新增测试、`/Users/hanyun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check support-stars.js` 和完整 Python 套件。** 预期全部通过。
- [x] **Step 5: 提交本任务**，提交信息 `feat: add shared cyber support sky`。

### Task 4: 整合、说明与上线验收

**Files:**
- Modify: `README.md`
- Modify: `tests/test_support_stars.py`

- [x] **Step 1: 补上回归测试** `test_existing_site_and_no_payment_notice_remain`，确认学校内容、课表、五日行程、联系人和“不收款”状态仍存在，首页没有金额、支付、订单或收据控件。
- [x] **Step 2: 实跑全部检查**：`python3 -m unittest discover -s tests -v`、`git diff --check`、`/Users/hanyun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check support-stars.js`。预期所有单测通过、无语法错误和空白问题。
- [x] **Step 3: 更新 README**：说明支持星空的匿名字段、留言公开规则、当前无强力反刷、管理员在 Supabase 后台删除不当留言，以及首次启用前须运行 SQL 迁移。
- [x] **Step 4: 应用 SQL 迁移并验证 Supabase select/insert/realtime**；迁移未成功前不得把页面状态显示为“全站共享正常”。
- [ ] **Step 5: 桌面与手机浏览器验收**：确认开关弹层、方向筛选、留言边界、公开确认、成功飞星、点击留言、实时新星、网络失败本机提示、键盘焦点与减少动态效果；确认现有课表和联系入口正常、无横向溢出。
- [ ] **Step 6: 部署到已授权的 GitHub Pages 仓库，并检查公开页面的共享状态与浏览器控制台。**
- [ ] **Step 7: 提交最终文档和验证记录**，提交信息 `docs: document support star operation`。
