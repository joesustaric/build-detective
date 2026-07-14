import * as assert from 'assert';
import * as vscode from 'vscode';
import { analyzeErrorWithLanguageModel } from './jobAnalyzer';

suite('analyzeErrorWithLanguageModel', () => {
  const prompt = 'Explain this Buildkite error';

  test('copies the prompt and returns Cursor-specific text when no models available in Cursor', async () => {
    let copiedText: string | undefined;
    let warningMessage: string | undefined;

    const result = await analyzeErrorWithLanguageModel(prompt, {
      selectChatModels: async () => [],
      writeClipboardText: async (text: string) => {
        copiedText = text;
      },
      showWarningMessage: (message: string) => {
        warningMessage = message;
      },
      ideName: 'Cursor'
    });

    assert.strictEqual(copiedText, prompt);
    assert.ok(warningMessage?.includes('Cursor Chat'));
    assert.ok(result.includes('Cursor'));
  });

  test('copies the prompt and returns VS Code-specific text when no models available in VS Code', async () => {
    let copiedText: string | undefined;
    let warningMessage: string | undefined;

    const result = await analyzeErrorWithLanguageModel(prompt, {
      selectChatModels: async () => [],
      writeClipboardText: async (text: string) => {
        copiedText = text;
      },
      showWarningMessage: (message: string) => {
        warningMessage = message;
      },
      ideName: 'Visual Studio Code'
    });

    assert.strictEqual(copiedText, prompt);
    assert.ok(warningMessage?.includes('Copilot'));
    assert.ok(result.includes('Copilot'));
  });

  test('collects and returns streamed text from the language model without toolMode', async () => {
    let capturedOptions: unknown;
    const mockModel = {
      id: 'mock-auto',
      sendRequest: async (_messages: unknown, options: unknown) => {
        capturedOptions = options;
        return {
          text: (async function* () {
            yield 'Here is ';
            yield 'the analysis.';
          })()
        };
      }
    } as unknown as vscode.LanguageModelChat;

    const result = await analyzeErrorWithLanguageModel(prompt, {
      selectChatModels: async () => [mockModel],
      writeClipboardText: async () => {},
      showWarningMessage: () => {}
    });

    assert.strictEqual(result, 'Here is the analysis.');
    assert.strictEqual(
      (capturedOptions as Record<string, unknown>)?.toolMode,
      undefined,
      'toolMode must not be set — passing Auto causes the stream to hang when the model makes a tool call'
    );
  });
});
