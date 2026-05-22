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

![Prompt configuration](../assets/prompt-03-student-prompt-config-en.png)

## 5. Trials, Submissions, and Leaderboard

Students can run trials on public train questions, then submit formal evaluations. A formal submission consumes one submission attempt and evaluates both train and test questions.

![Submit tab](../assets/prompt-04-submit-tab-en.png)

## 6. Teaching Notes

Prompt battles are inherently uncertain. Explain that the activity is primarily for learning and experience, public questions should be enough for debugging, hidden test questions should cover different difficulties, and unexpected results should be used to discuss output constraints, edge cases, and confident-but-wrong model behavior.
