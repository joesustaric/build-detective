import * as assert from 'assert';
import { BuildkiteClient } from './client';

suite('BuildkiteClient.installBkCli', () => {
  test('runs winget on Windows when exec succeeds', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: false, enumerable: true, configurable: true });

    let executedCommand: string | undefined;
    const fakeExec = async (cmd: string) => {
      executedCommand = cmd;
      return { stdout: '', stderr: '' };
    };

    try {
      const client = new BuildkiteClient('my-pipeline', 'main');
      await client.installBkCli(fakeExec);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: false, enumerable: true, configurable: true });
    }

    assert.strictEqual(executedCommand, 'winget install buildkite.bk --accept-package-agreements --accept-source-agreements --silent');
  });

  test('runs brew on non-Windows when exec succeeds', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: false, enumerable: true, configurable: true });

    let executedCommand: string | undefined;
    const fakeExec = async (cmd: string) => {
      executedCommand = cmd;
      return { stdout: '', stderr: '' };
    };

    try {
      const client = new BuildkiteClient('my-pipeline', 'main');
      await client.installBkCli(fakeExec);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: false, enumerable: true, configurable: true });
    }

    assert.strictEqual(executedCommand, 'brew install buildkite/buildkite/bk@3');
  });

  test('does not throw when winget fails on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: false, enumerable: true, configurable: true });

    const fakeExec = async (_cmd: string) => {
      throw new Error('winget: command not found');
    };

    try {
      const client = new BuildkiteClient('my-pipeline', 'main');
      await assert.doesNotReject(() => client.installBkCli(fakeExec));
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: false, enumerable: true, configurable: true });
    }
  });
});
