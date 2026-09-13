import * as vscode from 'vscode';
import type { PreflightService, PreflightReport } from './service';
import type { DashboardProvider } from './dashboardProvider';

/**
 * LM tool is report-only — never runs fix commands.
 */
export function registerPreflightCheckRunTool(
  context: vscode.ExtensionContext,
  getService: () => PreflightService | undefined,
  setReport: (report: PreflightReport) => void,
  dashboard: DashboardProvider
) {
  context.subscriptions.push(
    vscode.lm.registerTool('preflight_check_run', {
      async invoke(
        _options: vscode.LanguageModelToolInvocationOptions<object>,
        _token: vscode.CancellationToken
      ) {
        const service = getService();
        if (!service) {
          return textResult('No workspace folder is open.');
        }
        const report = await service.run();
        setReport(report);
        dashboard.showReport(report);
        dashboard.setSummary(
          `${report.summary.pass} pass · ${report.summary.fail} fail · ${report.summary.missing} missing`
        );
        return textResult(service.formatReport(report));
      },
    })
  );
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
