# GitHub Copilot v9 - Arc Syntax Resolution

I'll sync the current on-disk arc.tmLanguage.json, resolve the stale-content conflict, and apply a clean merged version so it saves without mismatches.

## Issue Identified

I found why this keeps conflicting: the file on disk still contains mixed arch scope names. I'll normalize all remaining scope tokens to arc, then you can safely reload/overwrite in the editor.

## Resolution Applied

File conflict resolved on disk and normalized.

I updated arc.tmLanguage.json so all leftover scope names are consistently `*.arc` (no mixed `*.arch` entries), and validated the JSON parses successfully.

## Next Steps

If VS Code still shows content is newer, do this once in the editor:

1. Run **File: Revert File** (or click **Compare** in the conflict dialog).
2. Keep the on-disk version (the one I just fixed).
3. Save again.

## Enhancement Option

If you want, I can also add support for `:` and `,` highlighting in the same grammar so `name: "..."` and `stack ["a", "b"]` look cleaner.
