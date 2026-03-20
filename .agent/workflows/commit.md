---
description: Generate a commit message from staged changes
---

## Auto-generate Commit Message

// turbo-all

1. Check for staged changes:

```powershell
git diff --staged --stat
```

If nothing is staged, tell the user to stage files first (`git add`).

2. Save the staged diff to a file:

```powershell
git diff --staged | Out-File -Encoding utf8 'C:\Users\theme\AppData\Local\Temp\commit-diff.txt'
```

3. Read the diff file with `view_file` at `C:\Users\theme\AppData\Local\Temp\commit-diff.txt`.

4. Write a commit message following conventional commits format:
   - First line: `type(scope): description` (max 72 chars)
   - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`
   - Blank line after subject
   - Body: bullet points explaining what changed and why
   - Be specific about file names and functions

5. Present the message to the user. Ask if they want to use it as-is, edit it, or regenerate.

6. If approved, run the commit:

```powershell
git commit -m "<the approved message>"
```
