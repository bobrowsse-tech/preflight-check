import * as vscode from 'vscode';
import type { PreflightReport } from './service';

const BUTTONS: { label: string; command: string }[] = [
  { label: 'Run Preflight', command: 'preflight.run' },
  { label: 'Fix Selected', command: 'preflight.fixSelected' },
  { label: 'View Full Report', command: 'preflight.viewReport' },
];

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private summary = 'No preflight run yet.';
  private report?: PreflightReport;
  private selectHandler?: (checkId: string) => void;

  constructor() {}

  onSelectCheck(handler: (checkId: string) => void) {
    this.selectHandler = handler;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        void vscode.commands.executeCommand(message.command, message.payload);
      } else if (message.type === 'select') {
        this.selectHandler?.(message.checkId);
      } else if (message.type === 'fix') {
        void vscode.commands.executeCommand('preflight.fixSelected', {
          checkId: message.checkId,
        });
      }
    });
    if (this.report) {
      this.showReport(this.report);
    }
  }

  setSummary(text: string) {
    this.summary = text;
    this.post({ type: 'summary', text });
  }

  showReport(report: PreflightReport) {
    this.report = report;
    this.post({
      type: 'report',
      report: {
        checks: report.checks.map((c) => ({
          id: c.id,
          tool: c.tool,
          expected: c.expected,
          actual: c.actual,
          status: c.status,
          source: c.source,
          fixCommand: c.fixCommand,
          detail: c.detail,
        })),
      },
    });
  }

  private post(message: unknown) {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: var(--vscode-font-size); }
    button {
      display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; text-align: left;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.fix {
      display: inline-block; width: auto; margin: 0; padding: 2px 8px; font-size: 0.75em;
      background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    }
    #summary { margin: 8px 0 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    table { width: 100%; border-collapse: collapse; font-size: 0.8em; }
    th, td { text-align: left; padding: 4px 2px; border-bottom: 1px solid var(--vscode-widget-border, transparent); vertical-align: top; }
    tr.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .pass { color: var(--vscode-testing-iconPassed); }
    .fail, .missing, .unreachable, .unset { color: var(--vscode-testing-iconFailed); }
    .conflict { color: var(--vscode-editorWarning-foreground); }
  </style>
</head>
<body>
  <div id="summary">${escapeHtml(this.summary)}</div>
  ${buttonsHtml}
  <table>
    <thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rowsEl = document.getElementById('rows');
    const summaryEl = document.getElementById('summary');
    document.querySelectorAll('button[data-command]').forEach((btn) => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'runCommand', command: btn.dataset.command }));
    });
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'summary') summaryEl.textContent = msg.text;
      if (msg.type === 'report') {
        rowsEl.innerHTML = '';
        for (const c of msg.report.checks) {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + esc(c.tool) + '</td>' +
            '<td>' + esc(c.expected) + '</td>' +
            '<td>' + esc(c.actual) + '</td>' +
            '<td class="' + esc(c.status) + '">' + esc(c.status) + '</td>' +
            '<td></td>';
          if (c.fixCommand) {
            const b = document.createElement('button');
            b.className = 'fix';
            b.textContent = 'Fix';
            b.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'fix', checkId: c.id });
            });
            tr.lastChild.appendChild(b);
          }
          tr.addEventListener('click', () => {
            rowsEl.querySelectorAll('tr').forEach((x) => x.classList.remove('selected'));
            tr.classList.add('selected');
            vscode.postMessage({ type: 'select', checkId: c.id });
          });
          rowsEl.appendChild(tr);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
