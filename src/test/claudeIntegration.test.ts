import * as assert from 'assert';
import { askClaude } from '../claudeIntegration';

suite('askClaude', () => {
  const prompt = 'These are Buildkite job errors:\n\nError: build failed\n\nHow can I fix them?';

  test('uses Claude extension when available', async () => {
    let executedCommand: string | undefined;
    let commandArgs: unknown[] = [];

    const result = await askClaude(prompt, {
      getExtension: (id: string) => (id === 'anthropic.claude-code' ? {} : undefined),
      executeCommand: async (cmd: string, ...args: unknown[]) => {
        executedCommand = cmd;
        commandArgs = args;
      },
      whichClaude: async () => null,
      writeClipboardText: async () => {},
      showInformationMessage: () => {},
      createTerminal: () => ({ show: () => {}, sendText: () => {} }),
    });

    assert.strictEqual(result, 'claude-extension');
    assert.strictEqual(executedCommand, 'claude-vscode.editor.open');
    assert.strictEqual(commandArgs[0], undefined);
    assert.strictEqual(commandArgs[1], prompt);
  });

  test('falls back to terminal when extension not installed but CLI available', async () => {
    let terminalCreated = false;
    let sentText: string | undefined;
    let sentAddNewline: boolean | undefined;

    const result = await askClaude(prompt, {
      getExtension: () => undefined,
      executeCommand: async () => {},
      whichClaude: async () => '/usr/local/bin/claude',
      writeClipboardText: async () => {},
      showInformationMessage: () => {},
      createTerminal: (_opts: { name: string }) => {
        terminalCreated = true;
        return {
          show: () => {},
          sendText: (text: string, addNewline?: boolean) => {
            sentText = text;
            sentAddNewline = addNewline;
          },
        };
      },
    });

    assert.strictEqual(result, 'claude-terminal');
    assert.strictEqual(terminalCreated, true);
    assert.strictEqual(sentAddNewline, false);
    assert.ok(sentText?.startsWith('/usr/local/bin/claude') || sentText?.startsWith("'"));
    assert.ok(sentText?.includes(' < '));
  });

  test('falls back to clipboard when neither extension nor CLI available', async () => {
    let copiedText: string | undefined;
    let infoMessage: string | undefined;

    const result = await askClaude(prompt, {
      getExtension: () => undefined,
      executeCommand: async () => {},
      whichClaude: async () => null,
      writeClipboardText: async (text: string) => {
        copiedText = text;
      },
      showInformationMessage: (msg: string) => {
        infoMessage = msg;
      },
      createTerminal: () => ({ show: () => {}, sendText: () => {} }),
    });

    assert.strictEqual(result, 'clipboard');
    assert.strictEqual(copiedText, prompt);
    assert.ok(infoMessage?.includes('Claude Code not found'));
  });

  test('uses terminal when whichClaude returns a Windows-style path', async () => {
    let sentText: string | undefined;

    const result = await askClaude(prompt, {
      getExtension: () => undefined,
      executeCommand: async () => {},
      whichClaude: async () => 'C:\\Users\\user\\AppData\\Local\\Programs\\claude\\claude.exe',
      writeClipboardText: async () => {},
      showInformationMessage: () => {},
      createTerminal: (_opts: { name: string }) => ({
        show: () => {},
        sendText: (text: string, _addNewline?: boolean) => {
          sentText = text;
        },
      }),
    });

    assert.strictEqual(result, 'claude-terminal');
    assert.ok(sentText !== undefined);
    assert.ok(
      sentText?.includes('C:\\Users\\user\\AppData\\Local\\Programs\\claude\\claude.exe'),
      `Expected Windows path in command, got: ${sentText}`
    );
  });

  test('uses cmd /c syntax for terminal command on Windows', async () => {
    let sentText: string | undefined;
    const windowsClaudePath = 'C:\\Users\\user\\AppData\\Local\\Programs\\claude\\claude.exe';

    // Temporarily override process.platform for this test
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: false, enumerable: true, configurable: true });

    try {
      await askClaude(prompt, {
        getExtension: () => undefined,
        executeCommand: async () => {},
        whichClaude: async () => windowsClaudePath,
        writeClipboardText: async () => {},
        showInformationMessage: () => {},
        createTerminal: (_opts: { name: string }) => ({
          show: () => {},
          sendText: (text: string, _addNewline?: boolean) => {
            sentText = text;
          },
        }),
      });
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: false, enumerable: true, configurable: true });
    }

    assert.ok(sentText?.startsWith('cmd /c'), `Expected cmd /c prefix, got: ${sentText}`);
    assert.ok(sentText?.includes(windowsClaudePath), `Expected path in command, got: ${sentText}`);
    assert.ok(sentText?.includes(' < '), `Expected stdin redirect, got: ${sentText}`);
  });
});
