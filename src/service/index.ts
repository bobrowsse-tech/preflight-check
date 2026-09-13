import { spawn } from 'child_process';
import which from 'which';
import { extractEnvExampleKeys, extractExpectations } from './expectations';
import { buildReport, checkEnvVars, probeTool } from './probe';
import type { CommandRunner, PreflightReport, WhichFn } from './types';

export type {
  CheckStatus,
  CommandRunner,
  ExpectedEnv,
  PreflightCheck,
  PreflightReport,
  WhichFn,
} from './types';
export { extractExpectations, extractEnvExampleKeys, normalizeVersion } from './expectations';
export { buildReport, checkEnvVars, probeTool, suggestFix } from './probe';
export { versionsMatchSafe } from './probeExports';

async function defaultRun(command: string, args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function defaultWhich(command: string): Promise<string | null> {
  try {
    return await which(command);
  } catch {
    return null;
  }
}

export interface PreflightDeps {
  run?: CommandRunner;
  which?: WhichFn;
  env?: NodeJS.ProcessEnv;
}

/**
 * VS Code–free preflight service. Fix execution stays in the extension host
 * (terminal + confirmation) — this module only suggests commands.
 */
export class PreflightService {
  constructor(
    private readonly root: string,
    private readonly deps: PreflightDeps = {}
  ) {}

  async run(): Promise<PreflightReport> {
    const run = this.deps.run ?? defaultRun;
    const whichFn = this.deps.which ?? defaultWhich;
    const env = this.deps.env ?? process.env;

    const expectations = extractExpectations(this.root);
    const toolChecks = [];
    for (const exp of expectations) {
      toolChecks.push(await probeTool(exp, run, whichFn));
    }
    const envChecks = checkEnvVars(extractEnvExampleKeys(this.root), env);
    return buildReport([...toolChecks, ...envChecks]);
  }

  formatReport(report: PreflightReport): string {
    const lines = [
      `Preflight checked at ${report.checkedAt}`,
      `Summary: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.missing} missing, ${report.summary.conflict} conflict, ${report.summary.unset} unset env`,
      '',
    ];
    for (const c of report.checks) {
      const fix = c.fixCommand ? ` | fix: ${c.fixCommand}` : '';
      lines.push(
        `[${c.status}] ${c.tool}: expected ${c.expected}, actual ${c.actual} (from ${c.source})${fix}`
      );
      if (c.detail) {
        lines.push(`  ${c.detail}`);
      }
    }
    return lines.join('\n');
  }
}
