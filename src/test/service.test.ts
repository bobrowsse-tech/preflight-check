import * as path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PreflightService,
  extractExpectations,
  extractEnvExampleKeys,
  suggestFix,
  versionsMatchSafe,
} from '../service';
import type { CommandRunner, WhichFn } from '../service';

const fixtures = path.join(__dirname, 'fixtures');

describe('extractExpectations', () => {
  it('reads .nvmrc', () => {
    const ex = extractExpectations(path.join(fixtures, 'mismatch'));
    const node = ex.find((e) => e.tool === 'node');
    assert.ok(node);
    assert.equal(node!.expectedVersion, '18.20.0');
    assert.equal(node!.source, '.nvmrc');
  });

  it('surfaces Dockerfile vs .nvmrc conflicts', () => {
    const ex = extractExpectations(path.join(fixtures, 'conflict'));
    const node = ex.find((e) => e.tool === 'node');
    assert.ok(node);
    assert.ok(node!.conflictingSources?.length);
  });

  it('reads asdf .tool-versions', () => {
    const ex = extractExpectations(path.join(fixtures, 'missing-tool'));
    assert.ok(ex.some((e) => e.tool === 'node'));
    assert.ok(ex.some((e) => e.tool === 'imaginarytool'));
  });
});

describe('versionsMatchSafe', () => {
  it('matches major.minor pins and ranges', () => {
    assert.equal(versionsMatchSafe('20.11.0', 'v20.11.0'), true);
    assert.equal(versionsMatchSafe('20', '20.11.0'), true);
    assert.equal(versionsMatchSafe('18.20.0', '20.11.0'), false);
    assert.equal(versionsMatchSafe('^18', '18.20.0'), true);
  });
});

describe('suggestFix', () => {
  it('maps tools to manager commands', () => {
    assert.match(suggestFix('node', '18.20.0'), /nvm install/);
    assert.match(suggestFix('python', '3.11.0'), /pyenv/);
  });
});

describe('PreflightService with mocked probes', () => {
  it('fails on version mismatch', async () => {
    const run: CommandRunner = async () => ({
      stdout: 'v20.11.0\n',
      stderr: '',
      exitCode: 0,
    });
    const which: WhichFn = async () => '/usr/bin/node';
    const service = new PreflightService(path.join(fixtures, 'mismatch'), {
      run,
      which,
      env: {},
    });
    const report = await service.run();
    const node = report.checks.find((c) => c.tool === 'node');
    assert.equal(node?.status, 'fail');
    assert.ok(node?.fixCommand);
    assert.ok(report.checks.some((c) => c.status === 'unset'));
  });

  it('passes when versions match', async () => {
    const run: CommandRunner = async (cmd) => {
      if (cmd === 'node') {
        return { stdout: 'v20.11.0\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'python' || cmd === 'python3') {
        return { stdout: 'Python 3.11.0\n', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'unknown', exitCode: 1 };
    };
    const which: WhichFn = async (cmd) =>
      cmd === 'node' || cmd === 'python' || cmd === 'python3' ? `/bin/${cmd}` : null;
    const service = new PreflightService(path.join(fixtures, 'passing'), { run, which, env: {} });
    const report = await service.run();
    assert.ok(report.checks.every((c) => c.status === 'pass'));
  });

  it('reports missing tools without throwing', async () => {
    const run: CommandRunner = async () => ({ stdout: '', stderr: '', exitCode: 1 });
    const which: WhichFn = async (cmd) => (cmd === 'node' ? '/bin/node' : null);
    const service = new PreflightService(path.join(fixtures, 'missing-tool'), {
      run: async (cmd, args) => {
        if (cmd === 'node') {
          return { stdout: 'v20.11.0\n', stderr: '', exitCode: 0 };
        }
        return run(cmd, args);
      },
      which,
      env: {},
    });
    const report = await service.run();
    const imag = report.checks.find((c) => c.tool === 'imaginarytool');
    assert.equal(imag?.status, 'missing');
  });

  it('flags source conflicts as conflict status', async () => {
    const service = new PreflightService(path.join(fixtures, 'conflict'), {
      run: async () => ({ stdout: 'v18.20.0\n', stderr: '', exitCode: 0 }),
      which: async () => '/bin/node',
      env: {},
    });
    const report = await service.run();
    assert.ok(report.checks.some((c) => c.status === 'conflict'));
  });
});

describe('extractEnvExampleKeys', () => {
  it('lists keys from .env.example', () => {
    const keys = extractEnvExampleKeys(path.join(fixtures, 'mismatch'));
    assert.deepEqual(
      keys.map((k) => k.key),
      ['DATABASE_URL', 'API_KEY']
    );
  });
});
