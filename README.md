# LLM Arena — Chatbot 竞技场

一个面向大模型教学和课堂竞赛的 Chatbot 竞技平台，类似 Kaggle。
教师可以发布活动、配置题库和评分器；学生订阅活动后提交 Prompt 或 Chatbot/API 配置；系统自动调用模型逐题作答、评分、排行，并在活动结束后展示颁奖结果。适用于 Prompt 设计大赛、智能体大赛和课程实践活动。

## 功能特性

- **四种参与模式**：管理员统一 LLM（学生只写 Prompt）/ OpenAI Compatible API / Dify / Coze
- **两种评分方式**：精确匹配（OBJECTIVE）/ LLM Judge 评分（SUBJECTIVE）
- **竞赛阶段**：DRAFT → PRELIMINARY（海选）→ FINALS（终赛）→ ENDED
- **自动晋级**：按测试集得分排序，同分扩招
- **排行榜 & 颁奖**：实时排行榜，竞赛结束后 Podium 颁奖展示
- **Worker Thread 评分**：独立 worker 线程处理提交，支持 LLM 并发控制
- **SSO 登录**：支持 jAccount 等 SSO 单点登录（可扩展其他 SSO 提供商）
- **站内通知 & 邮件通知**

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 数据库 | SQLite (Prisma ORM) |
| 认证 | 自定义 JWT + SSO |
| 部署 | Docker (node:20-alpine)，三阶段构建 |
| Worker | 独立 worker thread，esbuild 打包 |

## 在线体验与说明书

在线 Demo 已开放给教师和学生测试：

- Demo 地址：https://arena.sjtu.edu.cn
- Demo 活动：`Demo: Game 24（算24点）`
- 订阅码：`945351`

建议测试流程：注册或登录后进入“活动广场”，点击“输入订阅码”，输入 `945351` 加入 Demo 活动，然后按活动页提示完成报名、配置 Prompt 或 Chatbot、试跑公开题并查看排行榜。

使用说明书：

- [Arena 系统说明书](docs/system-guide.md)：平台角色、活动生命周期、题库分组、评分器、学生流程和上线检查清单。
- [大模型 Prompt 设计大赛（算 24 点）配置指南](docs/prompt-contest-guide.md)：教师统一提供模型，学生只设计 Prompt 的推荐配置流程。
- [大模型智能体大赛（算 24 点）配置指南](docs/agent-contest-guide.md)：学生自行接入 OpenAI 兼容 API / Dify / Coze 的智能体大赛配置流程。

## 快速部署（Docker）

1. 安装 Docker 和 Docker Compose

2. 克隆项目：
   ```bash
   git clone https://github.com/xuan-wei/LLMArena.git
   cd LLMArena
   ```

3. 配置环境变量：
   ```bash
   cp .env.example .env
   # 编辑 .env，至少设置 JWT_SECRET 为一个随机长字符串
   ```

4. 创建数据目录并启动：
   ```bash
   mkdir -p data
   docker compose up -d --build
   ```

5. 访问 http://localhost:3000

首次启动会自动初始化数据库并创建默认账户（见下方）。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | SQLite 数据库路径 | `file:/data/arena.db` |
| `JWT_SECRET` | JWT 签名密钥（**必填**） | — |
| `LLM_CONCURRENCY` | 每 LLM 账号并发调用数 | `15` |
| `SUBMISSION_CONCURRENCY` | Worker 同时处理提交数 | `10` |
| `FOOTER_COPYRIGHT` | 页脚版权信息 | — |
| `FOOTER_ICP` | 页脚 ICP 备案号 | — |
| `ALLOWED_DEV_ORIGINS` | 开发模式额外允许的 Origin（逗号分隔） | — |
| `JACCOUNT_CLIENT_ID` | jAccount SSO Client ID | — |
| `JACCOUNT_CLIENT_SECRET` | jAccount SSO Client Secret | — |
| `JACCOUNT_REDIRECT_URI` | SSO 回调 URL | — |
| `SMTP_HOST/PORT/USER/PASS` | SMTP 邮件配置 | — |

完整说明见 `.env.example`。

## 数据持久化

所有数据存储在单个 SQLite 文件 `./data/arena.db`，通过 Docker volume 挂载，容器重建后数据不丢失。

## 本地开发

```bash
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

访问 http://localhost:3000

## 默认账户

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@arena.edu | admin123 |
| 示例学生 | student@arena.edu | student123 |

## 数据迁移

```bash
# 旧服务器：停止容器后打包
docker compose down
tar czf arena-backup.tar.gz data/arena.db .env

# 新服务器：恢复并启动
git clone https://github.com/xuan-wei/arena.git && cd arena
tar xzf /path/to/arena-backup.tar.gz
docker compose up -d --build
```

> 必须先停容器再拷贝 DB（避免 WAL 文件导致数据损坏）。`.env` 中 `JWT_SECRET` 必须一起迁移，否则所有用户登录态失效。

## 更新部署

```bash
git pull
docker compose up -d --build
```
