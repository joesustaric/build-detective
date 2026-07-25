import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  analyzeErrorWithLanguageModel,
  BuildLookup,
  resolveJobErrors
} from './jobAnalyzer';
import { BkBuild, BkJob } from './client';

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

suite('resolveJobErrors', () => {
  const JOB_LOG = [
    '[10:00:00 AM] --- Running tests',
    'compiling...',
    'FAIL Error: expected 1 to equal 2'
  ].join('\n');

  const buildUrl = (pipelineSlug: string, buildNumber: number) =>
    `https://api.buildkite.com/v2/organizations/acme/pipelines/${pipelineSlug}/builds/${buildNumber}`;

  const makeJob = (
    id: string,
    state: string,
    triggeredBuildUrl?: string
  ): BkJob => ({
    id,
    state,
    name: `job-${id}`,
    type: 'script',
    rawJobUrl: `https://api.buildkite.com/v2/organizations/acme/pipelines/app/builds/1/jobs/${id}/log.txt`,
    triggered_build: triggeredBuildUrl
      ? {
          id: `tb-${id}`,
          number: 2,
          url: triggeredBuildUrl,
          webUrl: 'https://buildkite.com/acme/app/builds/2'
        }
      : undefined
  });

  const makeBuild = (id: string, number: number, jobs: BkJob[]): BkBuild => ({
    id,
    number,
    state: 'failed',
    jobs,
    url: buildUrl('app', number),
    webUrl: `https://buildkite.com/acme/app/builds/${number}`,
    pipelineSlug: 'app'
  });

  /**
   * Records which job log was asked for, so tests can assert chain depth.
   * Pass `null` for `log` to simulate a log that cannot be fetched — an
   * explicit `undefined` would silently fall back to the default.
   */
  const spyLookup = (
    builds: Record<string, BkBuild | undefined>,
    log: string | null = JOB_LOG
  ) => {
    const calls = { logUrl: undefined as string | undefined, details: 0 };
    const lookup: BuildLookup = {
      getBuildDetails: async (buildNumber) => {
        calls.details += 1;
        return builds[buildNumber];
      },
      getJobLog: async (logUrl) => {
        calls.logUrl = logUrl;
        return log ?? undefined;
      }
    };
    return { lookup, calls };
  };

  test('reads the parent job when there is no chain', async () => {
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed')]);
    const { lookup, calls } = spyLookup({});

    const result = await resolveJobErrors(parent, 'j1', lookup);

    assert.ok(result);
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j1/'));
    assert.ok(result.errors.join('\n').includes('Error: expected 1 to equal 2'));
  });

  test('walks one level down and reads the triggered build job', async () => {
    const childUrl = buildUrl('deploy', 2);
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed', childUrl)]);
    const child = makeBuild('b2', 2, [makeJob('j2', 'failed')]);
    const { lookup, calls } = spyLookup({ '2': child });

    const result = await resolveJobErrors(parent, 'j1', lookup, childUrl);

    assert.ok(result);
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1', 'b2']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j2/'));
  });

  test('collects every build in a multi-level chain, in order', async () => {
    const midUrl = buildUrl('mid', 2);
    const leafUrl = buildUrl('leaf', 3);
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed', midUrl)]);
    const mid = makeBuild('b2', 2, [makeJob('j2', 'failed', leafUrl)]);
    const leaf = makeBuild('b3', 3, [makeJob('j3', 'failed')]);
    const { lookup, calls } = spyLookup({ '2': mid, '3': leaf });

    const result = await resolveJobErrors(parent, 'j1', lookup, midUrl);

    assert.ok(result);
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1', 'b2', 'b3']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j3/'));
  });

  test('keeps the parent job when the triggered build has no failed job', async () => {
    const childUrl = buildUrl('deploy', 2);
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed', childUrl)]);
    const child = makeBuild('b2', 2, [makeJob('j2', 'canceled')]);
    const { lookup, calls } = spyLookup({ '2': child });

    const result = await resolveJobErrors(parent, 'j1', lookup, childUrl);

    assert.ok(
      result,
      'the parent failed job must survive a triggered build that has none of its own'
    );
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j1/'));
  });

  test('falls back to the parent job when the triggered build url is unparseable', async () => {
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed')]);
    const { lookup, calls } = spyLookup({});

    const result = await resolveJobErrors(parent, 'j1', lookup, 'not a url');

    assert.ok(result);
    assert.strictEqual(calls.details, 0, 'must not look up an unparseable ref');
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j1/'));
  });

  test('falls back to the parent job when the triggered build is not found', async () => {
    const childUrl = buildUrl('deploy', 2);
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed', childUrl)]);
    const { lookup, calls } = spyLookup({ '2': undefined });

    const result = await resolveJobErrors(parent, 'j1', lookup, childUrl);

    assert.ok(result);
    assert.strictEqual(calls.details, 1);
    assert.deepStrictEqual(
      result.triggeredBuilds.map((b) => b.id),
      ['b1']
    );
    assert.ok(calls.logUrl?.includes('/jobs/j1/'));
  });

  test('returns null when the job id is not in the build', async () => {
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed')]);
    const { lookup } = spyLookup({});

    const result = await resolveJobErrors(parent, 'not-a-job', lookup);

    assert.strictEqual(result, null);
  });

  test('returns null when the job log cannot be fetched', async () => {
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed')]);
    const { lookup } = spyLookup({}, null);

    const result = await resolveJobErrors(parent, 'j1', lookup);

    assert.strictEqual(result, null);
  });

  test('returns an empty error list, not null, when the log has no errors', async () => {
    const parent = makeBuild('b1', 1, [makeJob('j1', 'failed')]);
    const cleanLog = 'all good\nnothing to see here';
    const { lookup } = spyLookup({}, cleanLog);

    const result = await resolveJobErrors(parent, 'j1', lookup);

    assert.ok(result, 'a log without errors is still a resolved log');
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.fullLog, cleanLog);
  });
});
