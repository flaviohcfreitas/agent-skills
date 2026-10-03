---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them, typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Judge the resolution before finishing.** If the merge changes code, run the global Jev `--gate` with the two sides' intended behavior as `--spec-arquivo`, the check output as `--verificar-saida`, and a diff that actually contains the resolution (`--diff-arquivo` when `git diff HEAD` does not). Follow `~/.agents/skills/decision-gate/SKILL.md` for `passou`/`refaz`/`humano`/error; inspect the resolution yourself even on `passou`. Reuse a gate already run on the same final change.

6. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.
