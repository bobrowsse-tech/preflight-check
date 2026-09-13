import * as semver from 'semver';
import type {
  CommandRunner,
  ExpectedEnv,
  PreflightCheck,
  PreflightReport,
  WhichFn,
} from './types';
import { normalizeVersion } from './expectations';

const VERSION_COMMANDS: Record<string, { bin: string; args: string[]; parse: (out: string) => string }> = {
  node: {
    bin: 'node',
    args: ['-v'],
    parse: (o) => normalizeVersion(o.trim()),
  },
  python: {
    bin: 'python',
    args: ['--version'],
    parse: (o) => normalizeVersion(o.replace(/^Python\s+/i, '').trim()),
  },
  python3: {
    bin: 'python3',
    args: ['--version'],
    parse: (o) => normalizeVersion(o.replace(/^Python\s+/i, '').trim()),
  },
  go: {
    bin: 'go',
    args: ['version'],
    parse: (o) => {
      const m = o.match(/go(\d+\.\d+(?:\.\d+)?)/);
      return m ? m[1] : o.trim();
    },
  },
  docker: {
    bin: 'docker',
    args: ['version', '--format', '{{.Server.Version}}'],
    parse: (o) => o.trim(),
  },
  ruby: {
    bin: 'ruby',
    args: ['-v'],
    parse: (o) => {
      const m = o.match(/ruby\s+(\d+\.\d+\.\d+)/);
      return m ? m[1] : o.trim();
    },
  },
};

export function suggestFix(tool: string, expectedVersion: string): string {
  const v = normalizeVersion(expectedVersion);
  switch (tool) {
    case 'node':
      return `nvm install ${v} && nvm use ${v}`;
    case 'python':
    case 'python3':
      return `pyenv install ${v} && pyenv local ${v}`;
    case 'ruby':
      return `rbenv install ${v} && rbenv local ${v}`;
    case 'go':
      return `asdf install golang ${v} && asdf local golang ${v}`;
    case 'docker':
      return 'Open Docker Desktop and wait until the engine is running';
    default:
      return `asdf install ${tool} ${v} && asdf local ${tool} ${v}`;
  }
}

function versionsMatch(expected: string, actual: string): boolean {
  const exp = normalizeVersion(expected);
  const act = normalizeVersion(actual);
  if (!act) {
    return false;
  }
  // Range or caret/tilde
  if (semver.validRange(exp) && !semver.valid(exp)) {
    const coerced = semver.coerce(act);
    return coerced ? semver.satisfies(coerced, exp) : false;
  }
  const expCoerced = semver.coerce(exp);
  const actCoerced = semver.coerce(act);
  if (expCoerced && actCoerced) {
    // Pinned major.minor — allow patch drift if expectation has no patch
    if (/^\d+\.\d+$/.test(exp)) {
      return expCoerced.major === actCoerced.major && expCoerced.minor === actCoerced.minor;
    }
    if (/^\d+$/.test(exp)) {
      return expCoerced.major === actCoerced.major;
    }
    return semver.eq(expCoerced, actCoerced) || act.startsWith(exp);
  }
  return act === exp || act.startsWith(exp);
}

export async function probeTool(
  expectation: ExpectedEnv,
  run: CommandRunner,
  which: WhichFn
): Promise<PreflightCheck> {
  const id = `tool:${expectation.tool}`;
  if (expectation.conflictingSources?.length) {
    const detail = [
      `${expectation.source} → ${expectation.expectedVersion}`,
      ...expectation.conflictingSources.map((c) => `${c.source} → ${c.expectedVersion}`),
    ].join('; ');
    return {
      id,
      tool: expectation.tool,
      expected: expectation.expectedVersion,
      actual: '(conflict among sources)',
      status: 'conflict',
      source: expectation.source,
      detail: `Conflicting toolchain signals: ${detail}`,
      fixCommand: undefined,
    };
  }

  const spec = VERSION_COMMANDS[expectation.tool] ?? {
    bin: expectation.tool,
    args: ['--version'],
    parse: (o: string) => o.trim().split(/\s+/)[0] ?? o.trim(),
  };

  const resolved = await which(spec.bin);
  if (!resolved) {
    // python fallback to python3
    if (expectation.tool === 'python') {
      const py3 = await which('python3');
      if (py3) {
        return probeTool(
          { ...expectation, tool: 'python3' },
          run,
          which
        ).then((c) => ({ ...c, tool: 'python', id: 'tool:python' }));
      }
    }
    return {
      id,
      tool: expectation.tool,
      expected: expectation.expectedVersion,
      actual: 'not installed',
      status: 'missing',
      source: expectation.source,
      fixCommand: suggestFix(expectation.tool, expectation.expectedVersion),
    };
  }

  try {
    const result = await run(spec.bin, spec.args);
    const combined = `${result.stdout}\n${result.stderr}`.trim();

    if (expectation.tool === 'docker' && /Cannot connect|Is the docker daemon running/i.test(combined)) {
      return {
        id,
        tool: 'docker',
        expected: expectation.expectedVersion,
        actual: 'daemon unreachable',
        status: 'unreachable',
        source: expectation.source,
        detail: 'Docker Desktop not running',
        fixCommand: suggestFix('docker', expectation.expectedVersion),
      };
    }

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      return {
        id,
        tool: expectation.tool,
        expected: expectation.expectedVersion,
        actual: combined || `exit ${result.exitCode}`,
        status: 'fail',
        source: expectation.source,
        fixCommand: suggestFix(expectation.tool, expectation.expectedVersion),
      };
    }

    const actual = spec.parse(result.stdout || result.stderr);
    const ok = versionsMatch(expectation.expectedVersion, actual);
    return {
      id,
      tool: expectation.tool,
      expected: expectation.expectedVersion,
      actual,
      status: ok ? 'pass' : 'fail',
      source: expectation.source,
      fixCommand: ok ? undefined : suggestFix(expectation.tool, expectation.expectedVersion),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (expectation.tool === 'docker' && /docker daemon|Cannot connect/i.test(msg)) {
      return {
        id,
        tool: 'docker',
        expected: expectation.expectedVersion,
        actual: 'daemon unreachable',
        status: 'unreachable',
        source: expectation.source,
        fixCommand: suggestFix('docker', expectation.expectedVersion),
      };
    }
    return {
      id,
      tool: expectation.tool,
      expected: expectation.expectedVersion,
      actual: msg,
      status: 'fail',
      source: expectation.source,
      fixCommand: suggestFix(expectation.tool, expectation.expectedVersion),
    };
  }
}

export function checkEnvVars(
  keys: Array<{ key: string; source: string }>,
  env: NodeJS.ProcessEnv
): PreflightCheck[] {
  return keys.map(({ key, source }) => {
    const set = env[key] !== undefined && env[key] !== '';
    return {
      id: `env:${key}`,
      tool: `env:${key}`,
      expected: 'set',
      actual: set ? 'set' : 'unset',
      status: set ? 'pass' : 'unset',
      source,
      detail: set ? undefined : `Required by ${source} but not present in the extension host environment`,
      fixCommand: set ? undefined : `export ${key}=<value>  # or add to your shell profile / .env`,
    };
  });
}

export function buildReport(checks: PreflightCheck[]): PreflightReport {
  return {
    checkedAt: new Date().toISOString(),
    checks,
    summary: {
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail' || c.status === 'unreachable').length,
      missing: checks.filter((c) => c.status === 'missing').length,
      conflict: checks.filter((c) => c.status === 'conflict').length,
      unset: checks.filter((c) => c.status === 'unset').length,
    },
  };
}
