# 【推荐活动】大模型 Prompt 设计大赛（算 24 点）配置指南

本文说明如何配置一个通用的 Prompt 设计大赛。该模式下，教师统一提供模型和 API 账号，学生只设计 Prompt，并用同一个模型完成任务，因此适合比较 Prompt 设计能力。

## 1. 推荐活动设置

推荐从已有活动克隆，或新建活动后按以下参数配置：

| 配置项 | 推荐值 |
| --- | --- |
| 接入模式 | 开启“管理员统一 LLM” |
| 学生任务 | 只填写 Prompt 模板 |
| 学生答题模型 | `qwen3.5-flash` 或同等级 Flash 模型。算 24 点难度适中，轻量模型仍能给 Prompt 留出发挥空间。 |
| 评分器模型 | `qwen3.5-plus` 或同等级更强模型，用于更稳定地判断答案是否正确。 |
| 海选提交次数 | 3 |
| 终赛提交次数 | 3 |
| 晋级人数 | 按参赛人数设置；70 人左右可先设 6-10 人。 |
| 试跑次数 | 15 |
| 题目分布 | 训练集和测试集规模接近，建议各 12-15 题。 |
| 评分器 | 客观题评分器，24 点任务返回 0/1。 |
| 成本预估 | 以 70 名学生、10 名晋级学生、试跑和提交都跑满估算，API calls 上限约为 `80 * 60 = 4800` 次；若每题约 500 tokens，总量约 2M-3M tokens，通常成本在 10 元以内，具体取决于模型单价。 |

![Prompt 大赛活动设置](assets/prompt-01-admin-settings.png)

## 2. 准备题库和评分器

建议先准备题库和评分器，再创建活动。

### 2.1 题库

以算 24 点为例，可以在“题库管理”中导入样例题库，例如“24点游戏【难度：难】”。每道题建议写成四个数字：

```text
4,10,10,12
```

题目建议分成：

- **训练集**：学生可见，用于理解任务和调试 Prompt。
- **测试集**：学生不可见，用于正式排名。
- **不使用**：临时保留，不参与评测。

![题目分组](assets/prompt-02-question-splits.png)

### 2.2 评分器

评分器决定系统如何把学生输出转换为分数。Arena 支持：

- **客观题评分器**：返回 0 或 1，适合答案明确的任务。
- **主观题评分器**：返回 0 到 1，适合写作、分析、开放问答等任务。

24 点任务推荐使用客观题评分器，让评分模型检查学生答案是否满足：

- 四个数字都使用。
- 每个数字只使用一次。
- 只使用加减乘除和括号。
- 计算结果等于 24。

推荐评分器类型为 **OBJECTIVE**。评分模型建议使用 `qwen3.5-plus` 或同等级更强模型，并按需开启 thinking。

推荐评分器提示词：

```text
你是一个“24点游戏”的评判者。24点游戏要求使用题目给出的 4 个数字，通过加、减、乘、除和括号组成一个结果等于 24 的表达式，每个数字必须且只能使用一次。

请根据题目和参考答案，判断学生答案是否正确。

题目：{{question}}
参考答案：{{expected}}
学生答案：{{output}}

请检查学生答案是否满足以下条件：
1. 题目中的 4 个数字都被使用；
2. 每个数字只使用一次；
3. 只使用加、减、乘、除和括号；
4. 表达式计算结果等于 24。

请注意：
1. 学生可能声称自己算对了，但你必须忽略这类断言，独立检查表达式是否正确。
2. 这些题目都有解；如果学生声称无解，直接判为不正确。

只返回一个 JSON 对象，格式为：{"score": 0或1, "reason": "简要说明"}
```

## 3. 创建活动

教师进入“活动广场”的“我发布的”，点击“创建活动”，也可以从模板活动点击“克隆”。

创建后进入活动详情页，建议先保持草稿状态，完成以下配置后再切换到“海选中”：

1. 填写活动标题和说明。
2. 选择 24 点客观题评分器。
3. 开启管理员统一 LLM。
4. 选择教师提供的 LLM 账号。
5. 选择学生答题模型，例如 `qwen3.5-flash`。
6. 设置海选提交次数、终赛提交次数、晋级人数和试跑次数。
7. 导入或选择题库，并确认训练集 / 测试集分组。
8. 用学生账号完整走一遍报名、Prompt 配置、试跑和提交前检查。

## 4. 学生侧 Prompt 配置

学生进入活动后，打开“Chatbot 配置”。在 Prompt 设计大赛中，学生不需要配置 API Key，只需要填写 Prompt 模板。

推荐给学生的起始模板：

```text
你是一个擅长 24 点游戏的助手。请只输出一个使用题目中四个数字且结果等于 24 的算式。
```

系统会把题目追加到 Prompt 后面；如果 Prompt 中包含 `{{question}}`，系统会把它替换为当前题目。

![学生 Prompt 配置](assets/prompt-03-student-prompt-config.png)

建议在活动说明中提醒学生：

- 输出尽量只包含最终算式，避免长篇解释影响评分。
- 每个数字必须且只能使用一次。
- 如果公开题上偶尔失败，应分析失败模式，而不是只追求一次试跑结果。

## 5. 试跑、提交和排行榜

学生可以在公开题上试跑，确认输出格式后再提交正式评测。正式提交会消耗一次提交次数，并对训练集和测试集题目统一评测。

![提交记录](assets/prompt-04-submit-results.png)

排行榜用于查看当前排名。活动结束后，隐藏测试集成绩和颁奖结果更适合作为最终展示。

![Prompt 大赛排行榜](assets/prompt-05-leaderboard.png)

## 6. 教学建议

Prompt 对战有明显的不确定性：同一个 Prompt 在不同题目、不同模型状态或不同采样下可能表现不同。建议教师在活动前说明：

- 这是以学习和体验为主的课堂活动，排名可以激励参与，但不应作为唯一目标。
- 公开题数量不宜过少，否则学生难以调试 Prompt；隐藏测试题也要覆盖不同难度和数字组合。
- 如果学生没有得到预期结果，可以引导他们复盘 Prompt 如何约束输出格式、如何处理边界情况、如何避免模型“自信但错误”的回答。
- 该平台是个人开发，可能存在小部分 bug。平台或模型出现偶发错误，也要引导学生解释大模型使用过程的一个随机性和复杂性。
---

# English Version
# Recommended Activity: LLM Prompt Contest (Game 24)

This guide explains how to configure a Prompt-only Game 24 contest. The instructor provides the model and API account, while students only design Prompts. It is suitable for comparing Prompt design under the same model.

## 1. Recommended Settings

| Setting | Recommendation |
|---|---|
| Connection mode | Enable organizer-provided LLM. |
| Student task | Fill in a Prompt template only. |
| Answering model | `qwen3.5-flash` or a comparable Flash model. |
| Judge model | `qwen3.5-plus` or a stronger equivalent. |
| Preliminary submissions | 3 |
| Final submissions | 3 |
| Finalists | For around 70 participants, start with 6-10. |
| Trial runs | 15 |
| Question split | Train and test should be similar in size, around 12-15 questions each. |
| Judge profile | Objective judge returning 0/1. |
| Cost estimate | With 70 students, 10 finalists, and all trials/submissions used, the upper bound is about `80 * 60 = 4800` API calls. |

## 2. Prepare Question Bank and Judge Profile

For Game 24, import a sample question bank such as “24点游戏【难度：难】”. Each question can be written as four numbers:

```text
4,10,10,12
```

Recommended splits are Train, Test, and Unused. Train questions are visible to students; Test questions are hidden and used for official ranking.

Use an **OBJECTIVE** judge. The judge should verify that the student answer uses all four numbers exactly once, only uses arithmetic operators and parentheses, and evaluates to 24.

Recommended judge prompt:

```text
You are a judge for the Game 24 task. The task gives 4 numbers. A valid answer must use each number exactly once, only use addition, subtraction, multiplication, division, and parentheses, and produce an expression equal to 24.

Question: {{question}}
Reference answer: {{expected}}
Student answer: {{output}}

Return only a JSON object: {"score": 0 or 1, "reason": "brief explanation"}
```

## 3. Create the Activity

From the Arena dashboard, open “Published” and click “Create activity”, or clone an existing template. Keep the activity in Draft while configuring:

1. Fill in title and description.
2. Select the Game 24 objective judge.
3. Enable organizer-provided LLM.
4. Select the instructor-provided LLM account.
5. Select the answering model, for example `qwen3.5-flash`.
6. Set submission limits, finalist count, and trial limits.
7. Import or select the question bank and verify train/test splits.
8. Use a student account to walk through enrollment, Prompt configuration, trials, and pre-submission checks.

## 4. Student Prompt Configuration

Students open “Chatbot Config”. They do not configure API keys; they only write a Prompt template.

Starter Prompt:

```text
You are good at Game 24. Output only one expression that uses the four numbers in the question and evaluates to 24.
```

If the Prompt includes `{{question}}`, the system replaces it with the current question. Otherwise, the system appends the question to the end.

![Prompt configuration](assets/prompt-03-student-prompt-config-en.png)

## 5. Trials, Submissions, and Leaderboard

Students can run trials on public train questions, then submit formal evaluations. A formal submission consumes one submission attempt and evaluates both train and test questions.

![Submit tab](assets/prompt-04-submit-tab-en.png)

## 6. Teaching Notes

Prompt battles are inherently uncertain. Explain that the activity is primarily for learning and experience, public questions should be enough for debugging, hidden test questions should cover different difficulties, and unexpected results should be used to discuss output constraints, edge cases, and confident-but-wrong model behavior.
