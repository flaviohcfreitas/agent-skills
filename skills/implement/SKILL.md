---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Before calling the implementation done, run the global Jev gate from the project root: `node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo <acceptance-criteria> --verificar-saida <verification-output>`. Use the actual spec or tickets as acceptance criteria and the output of checks you ran; capture them in temporary files if needed. Confirm that the diff covers the whole delivery, including new files; pass `--diff-arquivo <complete-diff>` when `git diff HEAD` omits anything. Exit `0` allows the next review after you verify the evidence yourself; `2` means fix the objective gap and rerun checks (at most two rework attempts); `3` needs the principal's judgment or a user decision if outside the authorized scope; `1` means Jev did not judge, so verify manually and say so. Do not treat Jev as a replacement for tests or review. If /tdd already ran this gate for the same complete delivery, reuse its result instead of paying twice.

Once done, use /code-review to review the work.

Commit your work to the current branch.
