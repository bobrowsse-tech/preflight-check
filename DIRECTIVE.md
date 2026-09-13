
# Build Directive — Works-on-My-Machine Preflight

> Rank **#3** in the Unbuilt VS Code Tools roadmap. This directive is written for an AI coding agent (Claude Code, Copilot agent mode, or a human following along) to execute directly. The `preflight-check/` folder next to this file already contains a working scaffold — activation, side-panel dashboard, command registration, and a Language Model Tool stub — generated per the shared conventions in `../AGENTS.md`. Everything marked `TODO` below is the real remaining work.

## 1. Objective

Read the repo's own environment-defining files (.nvmrc, .tool-versions, Dockerfile base image, CI workflow YAML) to build an 'expected environment' manifest, check it against the developer's live machine, and render a pass/fail table with one-click fix commands instead of an hour of blind debugging.

## 2. Why this doesn't already exist

The expected environment is already fully specified across .nvmrc/.tool-versions/Dockerfile/CI YAML — but nothing cross-checks all of it against your live machine in one step; a version mismatch bug looks identical to a real bug until you go hunting for it manually.

## 3. VS Code surfaces this extension uses

- **Activity bar view container**: `preflight-checkContainer` (icon: `checklist`)
- **Side panel dashboard**: `preflight-checkView`, a `WebviewViewProvider` — see `src/dashboardProvider.ts`
- **Commands**: `preflight.run`, `preflight.fixSelected`, `preflight.viewReport`
- **Language Model Tool**: `preflight_check_run` — see `src/lmTool.ts` and `contributes.languageModelTools` in `package.json`. This is what lets Copilot Chat, Claude Code, or any other MCP/agent-aware surface invoke this extension's core action conversationally instead of the user hunting for the right command.

## 4. Dashboard (side panel) spec

The sidebar webview is the primary UI. It must show, at minimum, the buttons below plus a status/summary area above them (current scan state, last-run timestamp, or a short result summary — specifics depend on the feature, see phase notes).

| Button | Command | Behavior |
|---|---|---|
| **Run Preflight** | `preflight.run` | Reads the repo's declared toolchain requirements and checks them against the live machine, producing a pass/fail table. |
| **Fix Selected** | `preflight.fixSelected` | Runs the suggested fix command for a selected failing check (e.g. `nvm install <version> && nvm use`) in an integrated terminal, after showing the exact command for approval. |
| **View Full Report** | `preflight.viewReport` | Opens a detailed webview with every check, its expected vs. actual value, and the source file the expectation came from. |

Buttons call `vscode.commands.executeCommand`, not the tool logic directly — keep exactly one implementation of the core logic (a plain TypeScript service module with no VS Code imports) called from three places: the command handler, the dashboard's message handler, and the Language Model Tool's `invoke`. Do not fork the logic across these three entry points.

## 5. Implementation phases

1. **Expectation extraction** — Read, in priority order: `.nvmrc`/`.node-version` for Node, `.tool-versions` (asdf format: `<tool> <version>` per line) for any asdf-managed runtime, `.python-version`, the Dockerfile's base image tag (regex `FROM <image>:<tag>`) as a secondary signal, and `.github/workflows/*.yml` matrix/`uses: actions/setup-*` steps (parsed with `js-yaml`) as a tertiary cross-check. Merge into one `ExpectedEnv[]` list: {tool, expectedVersion, source}.
2. **Live machine probing** — For each tool, run its version command via `execa` (`node -v`, `python --version`, `docker version --format {{.Server.Version}}`, etc.), guarded with `which`/`command -v` first so a missing tool reports 'not installed' rather than throwing. Compare using `semver.satisfies` where the expectation is a range, or exact-match for pinned versions.
3. **Env var presence check** — Cross-reference `.env.example` (if present) against the developer's actual shell env (via `process.env` inside the extension host) and flag required keys that are simply unset locally — a common 'preflight' failure that isn't a version problem at all.
4. **Fix suggestions** — Map each mismatch to a concrete fix command per tool-manager convention (`nvm install <v> && nvm use <v>`, `pyenv install <v>`, `asdf install <tool> <v>`) and only ever show/run it after the user clicks 'Fix Selected' — never auto-execute on scan.
5. **Dashboard wiring** — WebviewView renders a table: Check / Expected / Actual / Status (pass/fail icon) / Fix button per row, plus a single 'Run Preflight' action at the top and a status-bar item showing a red/green summary badge.
6. **Language Model Tool** — Register `preflight_check_run` so an agent debugging a 'weird' failure can rule environment mismatch in or out as a first step.
7. **Tests** — Fixture repos with a deliberately mismatched `.nvmrc`, a missing tool, and a fully-passing case; mock `execa` calls in tests so they don't depend on the CI runner's actual toolchain.

## 6. Suggested dependencies

`semver`, `js-yaml`, `execa`, `which`

Install as regular `dependencies` (already stubbed into `package.json` — replace the `"latest"` version pins with the actual resolved versions once installed, per the pinning convention in `AGENTS.md`).

## 7. Edge cases & safety notes

- Never run a fix command without an explicit click and a visible confirmation of exactly what will run — this touches the developer's global toolchain, not just the workspace.
- A repo with conflicting signals (Dockerfile says Node 20, .nvmrc says 18) should surface the conflict itself as a finding, not silently pick one.
- Docker Desktop not running should report a clear 'Docker daemon unreachable' rather than a generic command-not-found.

## 8. Definition of done

- [ ] Core logic lives in a VS Code-free service module, unit-tested against fixtures (see phase notes above for what fixtures to build).
- [ ] All buttons in the dashboard spec are wired to real behavior, not the placeholder `showInformationMessage` stub.
- [ ] The Language Model Tool calls the same service module and returns a concise, agent-readable text result (not raw JSON dumped as text).
- [ ] No destructive or external-write action (file rewrite, PR post, process kill) runs without an explicit user-initiated click — the LM tool path in particular must stay read/report-only unless the directive above says otherwise.
- [ ] `npm run package` produces a `dist/extension.js` with no bundling warnings; `vsce package` produces a `.vsix` that installs cleanly via `code --install-extension`.
- [ ] README.md (user-facing, not this directive) documents what the extension does in plain language, per `AGENTS.md`'s copy conventions.
    