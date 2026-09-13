# Preflight Check

Verifies your machine matches what the repo expects — Node/Python/tool versions from `.nvmrc`, `.tool-versions`, Dockerfiles, and CI — before you waste time on cryptic failures.

## Install

```bash
git clone https://github.com/bobrowsse-tech/preflight-check.git
cd preflight-check
npm install
npm run package
npx @vscode/vsce package --no-dependencies
code --install-extension preflight-check-0.1.0.vsix
```

Or press **F5** after `npm install`.

## Use

Open the **Preflight Check** side panel (status bar item also available):

| Action | What it does |
|---|---|
| **Run Preflight** | Probes installed tools against repo expectations |
| **Fix Selected** | Shows a suggested command; you confirm before it runs in a terminal |
| **Open Report** | Full pass/fail/missing/conflict summary |

Agents can call `preflight_check` (report-only — fixes need a human click).

## How it’s built

TypeScript strict + esbuild; probe/expectation logic in `src/service/` (mockable runners for tests).

```bash
npm run watch
npm run test:unit
npm run package
```

## License

MIT

## Contributing

Changes to `main` must go through a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md).

### Extension Development Host

With the local suite umbrella checked out, press **F5** (**Extension + playground**) to load `../playgrounds/preflight-check/` as the test workspace.
