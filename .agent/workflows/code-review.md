---
description: Run a Gemini CLI code review on recent changes
---

## Code Review via Gemini CLI

// turbo-all

1. Generate a diff of recent changes:

```powershell
git diff HEAD
```

If the diff is empty, skip to step 2 with a holistic review prompt instead.

2. Write the review prompt to the temp file. Include severity ratings and a verdict requirement:

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

## Diff
``````diff
<paste diff here, or replace with "No specific diff. Perform a holistic codebase review.">
``````

## Additional Instructions
<any extra focus areas from the user>
"@
```

3. Run Gemini CLI from the **project root** and capture output to a fixed file:

```powershell
$p = Get-Content -Raw 'C:\Users\theme\AppData\Local\Temp\review-prompt.txt'; gemini -m flash -p $p 2>$null | Tee-Object -FilePath 'C:\Users\theme\AppData\Local\Temp\review-output.txt'
```

4. Read the output file with `view_file` at `C:\Users\theme\AppData\Local\Temp\review-output.txt`.

5. Present the review to the user.

6. If the verdict is **REQUEST CHANGES**, address each item and re-run from step 1.

7. If the verdict is **APPROVE**, notify the user that the review passed.
