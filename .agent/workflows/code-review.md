---
description: Run a Gemini CLI code review on recent changes
---

## Code Review via Gemini CLI

// turbo-all

1. Generate a diff and **save it to a file** (never read `git diff` from terminal buffer — it garbles):

```powershell
git diff HEAD | Out-File -Encoding utf8 'C:\Users\theme\AppData\Local\Temp\review-diff.txt'
```

If the diff is empty, skip to step 3 with a holistic review prompt instead.

2. Read the diff file with `view_file` at `C:\Users\theme\AppData\Local\Temp\review-diff.txt`.

3. Write the review prompt to the temp file. **Embed the diff content you just read**, not a placeholder. Include severity ratings and a verdict requirement:

```powershell
Set-Content -Path 'C:\Users\theme\AppData\Local\Temp\review-prompt.txt' -Value @"
You are a senior code reviewer. Review the codebase at @. for full project context.

Analyze the following diff for:
1. Bugs & Logic Errors
2. Edge Cases
3. Performance
4. Security
5. Style & Consistency
6. Testing gaps

Use severity ratings: 🔴 Critical, 🟡 Warning, 🟢 Suggestion.
End with a verdict: APPROVE, REQUEST CHANGES, or NEEDS DISCUSSION.
Be concise. Bullets over paragraphs.

Do NOT dismiss any finding by claiming the app is "personal use", "single user", "local only", or any similar assumption. Treat every finding as if this is production software with multiple users.

## Diff
``````diff
<PASTE THE DIFF CONTENT HERE — do NOT leave this as a placeholder>
``````

## Additional Instructions
<any extra focus areas from the user>
"@
```

4. **Delete stale output** before running Gemini CLI to prevent reading old results:

```powershell
Remove-Item -Force -ErrorAction SilentlyContinue 'C:\Users\theme\AppData\Local\Temp\review-output.txt'
```

5. Run Gemini CLI from the **project root** via `cmd /c gemini.cmd` (the PowerShell `.ps1` shim crashes with `StandardOutputEncoding` errors when stdout is redirected):

```powershell
cmd /c "cd /d c:\Users\theme\Desktop\LyricMachine && gemini.cmd -m flash -p ""$(Get-Content -Raw 'C:\Users\theme\AppData\Local\Temp\review-prompt.txt')"" > C:\Users\theme\AppData\Local\Temp\review-output.txt 2>&1"
```

⚠️ **CRITICAL**: Do NOT use `gemini` (the `.ps1` shim) with any form of output redirection (`>`, `| Tee-Object`, `2>$null`). It will crash with `StandardOutputEncoding` errors. Always use `cmd /c gemini.cmd` instead.

6. **Verify the output file exists and is non-empty.** If the file is missing, empty, or contains only error messages, report the failure to the user instead of reading stale results.

7. Read the output file with `view_file` at `C:\Users\theme\AppData\Local\Temp\review-output.txt`.

8. Present the review to the user.

9. If the verdict is **REQUEST CHANGES**, address each item and re-run from step 1.

10. If the verdict is **APPROVE**, notify the user that the review passed.
