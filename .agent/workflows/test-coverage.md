---
description: Run test coverage analysis and identify under-tested areas
---

## Test Coverage Analysis

// turbo-all

1. Run vitest with coverage:

```powershell
npx vitest run --coverage --coverage.reporter=text 2>&1 | Out-File -Encoding utf8 'C:\Users\theme\AppData\Local\Temp\coverage-output.txt'
```

2. Read the coverage output with `view_file` at `C:\Users\theme\AppData\Local\Temp\coverage-output.txt`.

3. Analyze the coverage report:
   - Identify files with < 50% line coverage
   - Identify files with 0% coverage (completely untested)
   - Note any critical server or composable files that are under-tested

4. Present findings to the user with recommendations:
   - Which files need tests most urgently
   - What types of tests would be most valuable (unit vs integration)
   - Estimate effort for each testing gap
