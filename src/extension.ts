import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerPreflightCheckRunTool } from './lmTool';
import { PreflightService, type PreflightCheck, type PreflightReport } from './service';

const LAST_REPORT_KEY = 'preflight.lastReport';
const SELECTED_KEY = 'preflight.selectedCheckId';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function createService(): PreflightService | undefined {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Preflight needs an open workspace folder.');
    return undefined;
  }
  return new PreflightService(root);
}

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('preflight-checkView', dashboard)
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'preflight.viewReport';
  statusBar.tooltip = 'Works-on-My-Machine Preflight';
  statusBar.text = '$(checklist) Preflight';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const setReport = (report: PreflightReport) => {
    void context.workspaceState.update(LAST_REPORT_KEY, report);
    const bad =
      report.summary.fail + report.summary.missing + report.summary.conflict + report.summary.unset;
    statusBar.text =
      bad === 0
        ? `$(check) Preflight ${report.summary.pass} ok`
        : `$(error) Preflight ${bad} issue(s)`;
    statusBar.backgroundColor =
      bad === 0
        ? undefined
        : new vscode.ThemeColor('statusBarItem.errorBackground');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('preflight.run', async () => {
      const service = createService();
      if (!service) {
        return undefined;
      }
      dashboard.setSummary('Running preflight…');
      try {
        const report = await service.run();
        setReport(report);
        dashboard.showReport(report);
        dashboard.setSummary(
          `${report.summary.pass} pass · ${report.summary.fail} fail · ${report.summary.missing} missing · ${report.summary.conflict} conflict · ${report.summary.unset} unset`
        );
        return report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dashboard.setSummary(`Preflight failed: ${msg}`);
        vscode.window.showErrorMessage(`Preflight failed: ${msg}`);
        return undefined;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('preflight.fixSelected', async (payload?: { checkId?: string }) => {
      const report = context.workspaceState.get<PreflightReport>(LAST_REPORT_KEY);
      if (!report) {
        vscode.window.showWarningMessage('Run Preflight first.');
        return;
      }
      let checkId = payload?.checkId ?? context.workspaceState.get<string>(SELECTED_KEY);
      let check: PreflightCheck | undefined = report.checks.find((c) => c.id === checkId);
      if (!check?.fixCommand) {
        const pick = await vscode.window.showQuickPick(
          report.checks
            .filter((c) => c.fixCommand)
            .map((c) => ({
              label: c.tool,
              description: c.status,
              detail: c.fixCommand,
              check: c,
            })),
          { title: 'Fix Selected — choose a failing check' }
        );
        if (!pick) {
          return;
        }
        check = pick.check;
      }
      if (!check?.fixCommand) {
        vscode.window.showInformationMessage('No fix command for that check.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Run this fix in the terminal?\n\n${check.fixCommand}`,
        { modal: true },
        'Run Fix'
      );
      if (confirm !== 'Run Fix') {
        return;
      }

      const term = vscode.window.createTerminal({ name: `Preflight fix: ${check.tool}` });
      term.show();
      term.sendText(check.fixCommand);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('preflight.viewReport', async () => {
      let report = context.workspaceState.get<PreflightReport>(LAST_REPORT_KEY);
      if (!report) {
        report = await vscode.commands.executeCommand<PreflightReport | undefined>('preflight.run');
      }
      if (!report) {
        return;
      }
      dashboard.showReport(report);
      await vscode.commands.executeCommand('preflight-checkView.focus');

      const panel = vscode.window.createWebviewPanel(
        'preflightFullReport',
        'Preflight Full Report',
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      );
      panel.webview.html = fullReportHtml(report);
    })
  );

  dashboard.onSelectCheck((id) => {
    void context.workspaceState.update(SELECTED_KEY, id);
  });

  registerPreflightCheckRunTool(context, () => createService(), setReport, dashboard);
}

export function deactivate() {}

function fullReportHtml(report: PreflightReport): string {
  const rows = report.checks
    .map(
      (c) =>
        `<tr>
          <td>${esc(c.tool)}</td>
          <td>${esc(c.expected)}</td>
          <td>${esc(c.actual)}</td>
          <td>${esc(c.status)}</td>
          <td>${esc(c.source)}</td>
          <td>${esc(c.fixCommand ?? '')}</td>
        </tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
  th, td { border-bottom: 1px solid var(--vscode-widget-border, #444); padding: 6px 8px; text-align: left; }
</style></head>
<body>
  <h1>Preflight report</h1>
  <p>Checked at ${esc(report.checkedAt)}</p>
  <table>
    <thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th><th>Source</th><th>Fix</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
