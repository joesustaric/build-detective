import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';

export type ClaudeIntegrationDependencies = {
  getExtension: (id: string) => unknown | undefined;
  executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  whichClaude: () => Promise<string | null>;
  writeClipboardText: (text: string) => Thenable<void>;
  showInformationMessage: (message: string) => void;
  createTerminal: (options: { name: string }) => {
    show: () => void;
    sendText: (text: string, addNewline?: boolean) => void;
  };
};

export type AskClaudeResult = 'claude-extension' | 'claude-terminal' | 'clipboard';

export async function askClaude(
  prompt: string,
  deps: ClaudeIntegrationDependencies,
): Promise<AskClaudeResult> {
  if (deps.getExtension('anthropic.claude-code')) {
    await deps.executeCommand('claude-vscode.editor.open', undefined, prompt);
    return 'claude-extension';
  }

  const claudePath = await deps.whichClaude();
  if (claudePath) {
    const tmpFile = path.join(os.tmpdir(), `claude-analysis-${randomUUID()}.txt`);
    await fsPromises.writeFile(tmpFile, prompt, 'utf-8');
    const terminal = deps.createTerminal({ name: 'Claude Analysis' });
    terminal.show();
    const command =
      process.platform === 'win32'
        ? `cmd /c ""${claudePath}" < "${tmpFile}""`
        : `'${claudePath}' < '${tmpFile}'`;
    terminal.sendText(command, false);
    return 'claude-terminal';
  }

  await deps.writeClipboardText(prompt);
  deps.showInformationMessage(
    'Claude Code not found. Install the Claude Code extension or CLI to analyze directly. Prompt copied to clipboard.',
  );
  return 'clipboard';
}

export function whichClaude(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
  return new Promise((resolve) => {
    exec(cmd, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim().split(/\r?\n/)[0].trim());
      }
    });
  });
}

export function createDefaultDependencies(): ClaudeIntegrationDependencies {
  return {
    getExtension: (id) => vscode.extensions.getExtension(id),
    executeCommand: (cmd, ...args) => vscode.commands.executeCommand(cmd, ...args),
    whichClaude,
    writeClipboardText: (text) => vscode.env.clipboard.writeText(text),
    showInformationMessage: (msg) => vscode.window.showInformationMessage(msg),
    createTerminal: (opts) => vscode.window.createTerminal(opts),
  };
}
