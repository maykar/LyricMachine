---
description: Run a Gemini CLI code review on recent changes
---

## Code Review via Gemini CLI

// turbo-all

1. Generate a diff and save it **inside the project** so the CLI can access it via `@`:

```powershell
git diff HEAD | Out-File -Encoding utf8 '.agent\review-diff.txt'
```

If the diff is empty, skip the `@.agent/review-diff.txt` reference in the prompt and ask for a holistic review instead.

2. Write a **short** prompt referencing the diff via `@` — never embed diff content inline (blows OS command-line length limit):

```powershell
Set-Content -Path 'C:\Users\theme\AppData\Local\Temp\review-prompt.txt' -Value 'You are a senior code reviewer. Review the codebase at @. for full project context. Review the diff at @.agent/review-diff.txt and analyze it for: 1. Bugs & Logic Errors 2. Edge Cases 3. Performance 4. Security 5. Style & Consistency 6. Testing gaps. Use severity ratings: Critical, Warning, Suggestion. End with a verdict: APPROVE, REQUEST CHANGES, or NEEDS DISCUSSION. Be concise. Bullets over paragraphs. Do NOT dismiss findings by claiming personal use or single user. <extra focus areas here>'
```

3. Run Gemini CLI via `cmd /c gemini.cmd` (**NOT** the `.ps1` shim — it crashes on stdout redirection). Use `WaitMsBeforeAsync: 90000` so the response is captured synchronously in the tool output:

```powershell
cmd /c "cd /d c:\Users\theme\Desktop\LyricMachine && gemini.cmd -m flash -p ""$(Get-Content -Raw 'C:\Users\theme\AppData\Local\Temp\review-prompt.txt')"""
```

> ⚠️ **No file redirection needed.** The review output comes back through the terminal buffer. Read it directly from the `run_command` or `command_status` output with `OutputCharacterCount: 10000`. Do NOT add `> output.txt` — it causes the output to go missing.

> ⚠️ **CRITICAL**: Do NOT use `gemini` (the `.ps1` shim) — it crashes with `StandardOutputEncoding` errors. Always use `cmd /c gemini.cmd`.

> ⚠️ **CRITICAL**: Do NOT embed the diff in the prompt string. Always use `@.agent/review-diff.txt`. Embedding large diffs overflows the OS command-line length limit.

4. If the command goes to background, call `command_status` with `OutputCharacterCount: 10000` and `WaitDurationSeconds: 120` to retrieve the full review text from the terminal buffer.

5. Present the review to the user.

6. If the verdict is **REQUEST CHANGES**, address each item and re-run from step 1.

7. If the verdict is **APPROVE**, notify the user that the review passed.
