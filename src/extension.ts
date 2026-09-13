import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerPreflightCheckRunTool } from './lmTool';

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("preflight-checkView", dashboard)
  );

  context.subscriptions.push(vscode.commands.registerCommand("preflight.run", () => {
    // TODO (Run Preflight): Reads the repo's declared toolchain requirements and checks them against the live machine, producing a pass/fail table.
    vscode.window.showInformationMessage("Run Preflight \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("preflight.fixSelected", () => {
    // TODO (Fix Selected): Runs the suggested fix command for a selected failing check (e.g. `nvm install <version> && nvm use`) in an integrated terminal, after showing the exact command for approval.
    vscode.window.showInformationMessage("Fix Selected \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("preflight.viewReport", () => {
    // TODO (View Full Report): Opens a detailed webview with every check, its expected vs. actual value, and the source file the expectation came from.
    vscode.window.showInformationMessage("View Full Report \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  // Exposes the same capability to Copilot Chat / Claude Code / any MCP-aware
  // agent via the Language Model Tool API — see contributes.languageModelTools
  // in package.json and DIRECTIVE.md, section "Language Model Tool".
  registerPreflightCheckRunTool(context);
}

export function deactivate() {}
