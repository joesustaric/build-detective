import * as vscode from 'vscode';
import {
  LanguageModelChatMessageRole,
  LanguageModelTextPart
} from 'vscode';
import { escapeHtml } from '../utils';
import { BkBuild, BkJob, BuildkiteClient } from './client';

type LanguageModelAnalyzerDependencies = {
  selectChatModels: () => Thenable<readonly vscode.LanguageModelChat[]>;
  writeClipboardText: (text: string) => Thenable<void>;
  showWarningMessage: (message: string) => void;
  cancellationToken?: vscode.CancellationToken;
  ideName?: string;
};

export async function analyzeErrorWithLanguageModel(
  prompt: string,
  dependencies: LanguageModelAnalyzerDependencies
): Promise<string> {
  const models = await dependencies.selectChatModels();
  if (!models.length) {
    await dependencies.writeClipboardText(prompt);
    const isCursor = dependencies.ideName === 'Cursor';
    const target = isCursor ? 'Cursor Chat' : 'Copilot Chat';
    dependencies.showWarningMessage(
      `No VS Code Language Model API chat models are available. The analysis prompt has been copied so you can paste it into ${target}.`
    );
    return isCursor
      ? 'Cursor does not currently expose its native chat models through the VS Code Language Model API. The analysis prompt has been copied to your clipboard so you can paste it into Cursor Chat.'
      : 'No Language Model API chat models available. The analysis prompt has been copied to your clipboard so you can paste it into Copilot Chat.';
  }

  const chatModel = models.find((m) => m.id.includes('auto')) || models[0];
  const response = await chatModel.sendRequest(
    [
      {
        name: 'analyse-bk-errors',
        role: LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart(prompt)]
      }
    ],
    {},
    dependencies.cancellationToken
  );

  let result = '';
  for await (const chunk of response.text) {
    result += chunk;
  }
  return result;
}

export function buildAnalysisPrompt(errorText: string): string {
  return `# Context
- Use the context from .github/skills/**/SKILL.md, and any other relevant information you have about Buildkite pipelines and common issues
- Include reference of the SKILL.md file if relevant, and any other relevant information you have about Buildkite pipelines and common issues in a "References" section below your answer

# Prompt
These are Buildkite job errors:\n\n${errorText}\n\nHow can I fix them?`;
}

export type ResolvedJobErrors = {
  errors: string[];
  fullLog: string;
  triggeredBuilds: BkBuild[];
};

/**
 * The two Buildkite operations the triggered build chain walk needs.
 * `BuildkiteClient` satisfies this structurally; tests pass an object literal.
 */
export type BuildLookup = {
  getBuildDetails(
    buildNumber: string,
    pipelineSlug?: string
  ): Promise<BkBuild | undefined>;
  getJobLog(logUrl: string): Promise<string | undefined>;
};

export async function resolveJobErrors(
  currentBuild: BkBuild,
  jobId: string,
  lookup: BuildLookup,
  triggeredBuildUrl?: string
): Promise<ResolvedJobErrors | null> {
  const triggeredBuilds: BkBuild[] = [currentBuild];
  let failedJob: BkJob | undefined = currentBuild.jobs?.find(
    (job) => job.id === jobId
  );

  while (triggeredBuildUrl) {
    const triggeredBuildRef =
      BuildkiteClient.extractBuildRef(triggeredBuildUrl);
    if (!triggeredBuildRef) {
      break;
    }

    const build = await lookup.getBuildDetails(
      triggeredBuildRef.buildNumber,
      triggeredBuildRef.pipelineSlug
    );
    if (!build) {
      break;
    }

    // Resolve into a local before committing to it: a triggered build with no
    // failed job of its own ends the chain, and the job above it stays the one
    // we diagnose.
    const nextFailedJob = build.jobs?.find(
      (job: BkJob) => job.state === 'failed'
    );
    if (!nextFailedJob) {
      break;
    }

    failedJob = nextFailedJob;
    triggeredBuilds.push(build);
    triggeredBuildUrl = nextFailedJob.triggered_build?.url;
  }

  if (!failedJob) {
    return null;
  }

  const jobLog = await lookup.getJobLog(failedJob.rawJobUrl);
  if (!jobLog) {
    return null;
  }

  const { errors, fullLog } = BuildkiteClient.extractErrorSnippets(jobLog);
  return { errors, fullLog, triggeredBuilds };
}

export class BuildkiteJobAnalyzer {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private jobId: string;
  private jobName: string;
  private triggeredBuilds: BkBuild[];
  private errors: string[];
  private fullErrorLog?: string;
  private result?: string;
  private cssUri: vscode.Uri | undefined;
  private activeRequestCancel: vscode.CancellationTokenSource | undefined;
  private systemErrorMessage: string | undefined;
  private isLoadingErrorLog = false;
  private isAnalyzingErrorLog = false;

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  reveal() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
    }
  }

  constructor(
    jobId: string,
    jobName: string,
    context: vscode.ExtensionContext
  ) {
    this.jobId = jobId;
    this.jobName = jobName;
    this.triggeredBuilds = [];
    this.errors = [];
    this.context = context;

    this.createPanel();
  }

  private createPanel() {
    this.panel = vscode.window.createWebviewPanel(
      `jobErrorPanel.${this.jobId}`,
      `Analysis for Job ${this.jobName}`,
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );

    this.cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css')
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;

      this.activeRequestCancel?.cancel();
      this.activeRequestCancel?.dispose();
      this.activeRequestCancel = undefined;
    });
  }

  async open(
    currentBuild: BkBuild,
    lookup: BuildLookup,
    triggeredBuildUrl?: string
  ) {
    if (!this.panel) {
      this.createPanel();
    } else {
      this.panel.reveal(vscode.ViewColumn.Active);
    }

    this.triggeredBuilds = [currentBuild];
    this.systemErrorMessage = undefined;
    this.isLoadingErrorLog = true;

    if (this.panel) {
      this.panel.webview.html = this.createWebviewContent();
    }

    const result = await resolveJobErrors(
      currentBuild,
      this.jobId,
      lookup,
      triggeredBuildUrl
    );

    if (!result) {
      if (this.panel) {
        this.systemErrorMessage =
          'No failed job found or could not fetch job log.';
        this.panel.webview.html = this.createWebviewContent();
      }
      return;
    }

    this.triggeredBuilds = result.triggeredBuilds;
    this.isLoadingErrorLog = false;
    this.errors = result.errors;
    this.fullErrorLog = result.fullLog;
    if (this.panel) {
      this.panel.webview.html = this.createWebviewContent();
    }

    // Analyze the full error log with AI
    if (this.errors.length) {
      this.isAnalyzingErrorLog = true;
      if (this.panel) {
        this.panel.webview.html = this.createWebviewContent();
      }

      this.result = await this.askCopilot(result.errors.join('\n'));
      this.isAnalyzingErrorLog = false;
    }
    if (this.panel) {
      this.panel.webview.html = this.createWebviewContent();
    }
  }

  private createWebviewContent(): string {
    const cspSource = this.panel?.webview.cspSource;

    const triggeredBuildsBlock = `<section>
      ${
        this.triggeredBuilds
          .map(
            (b, idx) =>
              `<div class="triggered-build">
                <span>${
                  idx > 0
                    ? `└${Array(idx).fill('─').join('')} Triggered Build:`
                    : 'Initial Build:'
                }</span>
                <a href="${b.webUrl}" target="_blank">
                  ${b.pipelineSlug ? `[${b.pipelineSlug.toUpperCase()}] ` : ''}#${b.number}: ${b.message || 'No message'}
                </a>
              </div>`
          )
          .join('') || 'No triggered builds.'
      }
    </section>`;

    const systemErrorBlock = this.systemErrorMessage
      ? `<section>
      <h1 class="text-red">System Error: ${this.systemErrorMessage}</h1>
    </section>`
      : '';

    let errorMessage = 'No errors found in log...';
    if (this.isLoadingErrorLog) {
      errorMessage = 'Loading errors from log...';
    } else if (this.errors.length > 0) {
      errorMessage = this.errors.map((e) => `<p>${escapeHtml(e)}</p>`).join('');
    }

    const errorBlock = `<section>
      <h3>Errors Snippet</h3>
      <div class="code-block error">${errorMessage}</div>
    </section>`;

    let analysis = '';
    if (this.isAnalyzingErrorLog) {
      analysis = 'Analyzing errors with AI...';
    } else if (this.result) {
      analysis = this.result;
    } else if (this.isLoadingErrorLog) {
      analysis = '...';
    }

    const analysisBlock = `<section>
      <h3>AI Analysis</h3>
      <div class="code-block overflow-auto">${analysis ? escapeHtml(analysis) : 'No analysis available.'}</div>
    </section>`;

    return `
      <html>
      <head>
        <title>Errors Analysis Job ${this.jobId}</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource};">
        <link rel="stylesheet" type="text/css" href="${this.cssUri}">
      </head>
      <body>
        <section>
          <h2>Errors Analysis for Job ${this.jobId}</h2>
        </section>
        ${systemErrorBlock}
        ${triggeredBuildsBlock}
        ${errorBlock}
        ${analysisBlock}
        <br/>
      </body>
      </html>
    `;
  }

  private async askCopilot(error: string) {
    this.activeRequestCancel?.cancel();
    this.activeRequestCancel?.dispose();

    this.activeRequestCancel = new vscode.CancellationTokenSource();

    const prompt = buildAnalysisPrompt(error);

    try {
      const isCursor = vscode.env.appName === 'Cursor';
      return await analyzeErrorWithLanguageModel(prompt, {
        selectChatModels: () => vscode.lm.selectChatModels(),
        writeClipboardText: (text) => vscode.env.clipboard.writeText(text),
        showWarningMessage: isCursor
          ? (message) => { vscode.window.setStatusBarMessage(message, 10000); }
          : (message) => { vscode.window.showWarningMessage(message); },
        cancellationToken: this.activeRequestCancel.token,
        ideName: vscode.env.appName
      });
    } finally {
      this.activeRequestCancel?.dispose();
      this.activeRequestCancel = undefined;
    }
  }
}
