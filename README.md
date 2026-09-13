# Works-on-My-Machine Preflight

Compares your live toolchain to what the repo already declares — `.nvmrc`, `.tool-versions`, Dockerfile, CI setup actions, and `.env.example` — and shows pass/fail with optional one-click fix commands.

1. **Run Preflight** — extracts expectations and probes your machine.
2. **Fix Selected** — shows the exact command and runs it in a terminal only after you confirm.
3. **View Full Report** — detailed expected vs actual with source files.

Agents can call `preflight_check_run` for a report-only check (never auto-fixes).

## Development

```bash
npm install
npm run watch
npm run test:unit
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

MIT
