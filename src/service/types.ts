export interface ExpectedEnv {
  tool: string;
  expectedVersion: string;
  source: string;
  /** When multiple sources disagree. */
  conflictingSources?: Array<{ source: string; expectedVersion: string }>;
}

export type CheckStatus =
  | 'pass'
  | 'fail'
  | 'missing'
  | 'conflict'
  | 'unreachable'
  | 'unset';

export interface PreflightCheck {
  id: string;
  tool: string;
  expected: string;
  actual: string;
  status: CheckStatus;
  source: string;
  fixCommand?: string;
  detail?: string;
}

export interface PreflightReport {
  checkedAt: string;
  checks: PreflightCheck[];
  summary: {
    pass: number;
    fail: number;
    missing: number;
    conflict: number;
    unset: number;
  };
}

export type CommandRunner = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export type WhichFn = (command: string) => Promise<string | null>;
