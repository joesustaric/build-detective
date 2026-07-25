import * as vscode from 'vscode';
import {
  BkBuild,
  BkJob,
  BkState,
  BuildkiteClient,
  DEFAULT_JOB_STATES_FILTER,
  RUNNING_STATES,
} from './client';
import {
  buildAnalysisPrompt,
  BuildkiteJobAnalyzer,
  resolveJobErrors,
} from './jobAnalyzer';
import {
  getWebviewResourceUris,
  getCurrentBranch,
  escapeHtml,
  renderEmojiShortcodes,
  getNonce,
  getIdeButtonLabel,
} from '../utils';
import { askClaude, createDefaultDependencies } from '../claudeIntegration';

const AUTO_REFRESH_INTERVAL = 20; // in seconds
const AUTO_REFRESH_INTERVAL_MS = AUTO_REFRESH_INTERVAL * 1000;

type StatusBarStatus = 'loading' | 'info' | 'success' | 'warning' | 'error';

export const getBuildStatusBarState = (
  build: Pick<BkBuild, 'state'> | undefined,
): {
  message: string;
  status: StatusBarStatus;
} => {
  if (!build) {
    return { message: 'No builds found', status: 'info' };
  }

  if (build.state === 'failed') {
    return { message: 'Build failed', status: 'error' };
  }
  if (build.state === 'passed') {
    return { message: 'Build passed', status: 'success' };
  }
  if (build.state === 'running') {
    return { message: 'Build running', status: 'loading' };
  }

  return { message: `Build ${build.state}`, status: 'info' };
};

enum BuildkiteSidebarViewProviderState {
  main,
  settings,
}

class SettingsDetailsOpen {
  private state: Map<string, boolean> = new Map([['jobStatesFilter', true]]);

  isOpen(section: string): boolean {
    return this.state.get(section) ?? false;
  }

  set(section: string, isOpen: boolean): void {
    this.state.set(section, isOpen);
  }
}

export class BuildkiteSidebarViewProvider
  implements vscode.WebviewViewProvider
{
  constructor(private readonly context: vscode.ExtensionContext) {
    // Register command (no-op, kept for compatibility)
    const openPanelCommand = vscode.commands.registerCommand(
      'build-detective.openPanel',
      () => {
        vscode.window.showInformationMessage(
          'The Build Detective UI is now in the sidebar panel.',
        );
      },
    );
    context.subscriptions.push(openPanelCommand);

    const openSidebarCommand = vscode.commands.registerCommand(
      'build-detective.openSidebar',
      async () => {
        await vscode.commands.executeCommand(
          'buildDetectiveView.focus',
        );
      },
    );
    context.subscriptions.push(openSidebarCommand);

    // Register sidebar view provider (must match package.json id)
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'buildDetectiveView',
        this,
      ),
    );

    // Ensure polling and status bar are cleaned up on extension deactivation
    context.subscriptions.push({ dispose: () => this.dispose() });

    // Initialize status bar item
    this.statusBar = vscode.window.createStatusBarItem(
      'buildDetective.status',
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBar.command = 'build-detective.openSidebar';
    this.setStatusBarMessage('Setting up analyzer...', 'loading');
  }

  public isInitialized: boolean = false;
  public repoName: string | undefined = undefined;

  private currentState: BuildkiteSidebarViewProviderState =
    BuildkiteSidebarViewProviderState.main;
  private currentBranch: string | undefined = undefined;
  private buildkiteClient: BuildkiteClient | undefined = undefined;
  private pollingInterval: NodeJS.Timeout | undefined = undefined;
  private jobStatesFilter: string[] = [];
  private webviewParent: vscode.WebviewView | undefined = undefined;
  private webview: vscode.Webview | undefined = undefined;
  private webviewResourceUris = {
    css: [] as vscode.Uri[],
    js: [] as vscode.Uri[],
  };
  private latestBuild: BkBuild | undefined = undefined;
  private get isAutoRefreshPaused(): boolean {
    return (
      !!this.pollingInterval &&
      !RUNNING_STATES.includes(this.latestBuild?.state as BkState)
    );
  }
  private analyzerPanels: {
    [jobId: string]: BuildkiteJobAnalyzer | undefined;
  } = {};
  private statusBar: vscode.StatusBarItem | undefined = undefined;
  private settingsDetailsState = new SettingsDetailsOpen();

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.setupWebview(webviewView);

    this.jobStatesFilter = this.context.globalState.get<BkState[]>(
      'buildkiteJobStatesFilter',
      DEFAULT_JOB_STATES_FILTER,
    );

    if (this.isInitialized) {
      // Already running in background; render cached data immediately
      const jobsHtml = await this.generateJobsHtml(true);
      if (this.webview) {
        this.webview.html = this.getSidebarHtml(this.currentBranch, jobsHtml);
      }
    } else {
      this.refreshMainSidebarView();
    }
  }

  async initialize() {
    if (this.isInitialized || !this.repoName) {
      return;
    }

    this.currentBranch = await getCurrentBranch();
    if (!this.currentBranch) {
      this.setStatusBarMessage('Could not determine branch', 'warning');
      return;
    }

    this.buildkiteClient = new BuildkiteClient(
      this.repoName,
      this.currentBranch,
    );

    const hasBkCli = await this.buildkiteClient.hasCli();
    if (!hasBkCli) {
      // No Buildkite CLI and no signal this repo uses Buildkite — stay quiet
      // rather than nagging every git repo the user happens to open.
      this.statusBar?.hide();
      return;
    }

    const isAuthenticated = await this.buildkiteClient.whoami();
    if (!isAuthenticated) {
      this.setStatusBarMessage('Not authenticated with Buildkite', 'warning');
      return;
    }

    this.setupPolling();

    // Initial background fetch — updates status bar and caches latestBuild
    this.latestBuild = await this.buildkiteClient.getLatestBuild();
    const { message, status } = getBuildStatusBarState(this.latestBuild);
    this.setStatusBarMessage(message, status);

    // Render webview if it was already opened before initialization completed
    if (this.webview) {
      const jobsHtml = await this.generateJobsHtml(true);
      this.webview.html = this.getSidebarHtml(this.currentBranch, jobsHtml);
    }

    this.isInitialized = true;
  }

  setupWebview(webviewView: vscode.WebviewView) {
    this.webviewParent = webviewView;
    this.webview = webviewView.webview;
    this.webviewResourceUris = getWebviewResourceUris(
      this.webview,
      this.context.extensionUri,
    );
    this.webview.options = { enableScripts: true };
    this.resetSidebarView();

    this.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        // CLI setup handlers
        case 'bkCliInstall':
          if (this.buildkiteClient) {
            this.resetSidebarView('Installing Buildkite CLI, please wait...');
            this.setStatusBarMessage('Setting up analyzer...', 'loading');
            await this.buildkiteClient.installBkCli();
            this.refreshMainSidebarView();
          }
          break;

        case 'bkCliAuth':
          if (this.buildkiteClient) {
            this.resetSidebarView(
              'Opening Buildkite CLI authentication, please follow the prompts...',
            );
            try {
              await this.buildkiteClient.authLogin();
              vscode.window.showInformationMessage(
                'Buildkite CLI authentication successful!',
              );
              this.setStatusBarMessage('Authenticating...', 'loading');
            } catch (e) {
              vscode.window.showErrorMessage(
                'Buildkite CLI authentication failed. Please try again.',
              );
              this.setStatusBarMessage('Authentication failed', 'error');
            }
            this.refreshMainSidebarView();
          }
          break;

        // Webview function handlers
        case 'refreshBuild':
          this.refreshMainSidebarView();
          break;

        case 'openBuildUrl':
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;

        case 'analyzeJob':
          if (this.repoName && this.currentBranch && this.buildkiteClient) {
            let newlyAddedPanel = false;
            if (!this.analyzerPanels[message.jobId]) {
              this.analyzerPanels[message.jobId] = new BuildkiteJobAnalyzer(
                message.jobId,
                message.jobName,
                this.context,
              );
              newlyAddedPanel = true;
            }
            if (
              this.analyzerPanels[message.jobId]!.isOpen() &&
              !newlyAddedPanel
            ) {
              this.analyzerPanels[message.jobId]!.reveal();
            } else {
              await this.analyzerPanels[message.jobId]!.open(
                this.latestBuild!,
                this.buildkiteClient,
                message.triggeredBuildData === 'undefined'
                  ? undefined
                  : message.triggeredBuildData,
              );
            }
          }
          break;

        case 'addJobStateFilter':
          if (!this.jobStatesFilter.includes(message.state)) {
            this.jobStatesFilter.push(message.state);
            this.context.globalState.update(
              'buildkiteJobStatesFilter',
              this.jobStatesFilter,
            );
          }
          break;

        case 'removeJobStateFilter':
          if (this.jobStatesFilter.includes(message.state)) {
            this.jobStatesFilter = this.jobStatesFilter.filter(
              (state) => state !== message.state,
            );
            this.context.globalState.update(
              'buildkiteJobStatesFilter',
              this.jobStatesFilter,
            );
          }
          break;

        case 'openSettings':
          this.currentState = BuildkiteSidebarViewProviderState.settings;
          this.resetSidebarView();
          break;

        case 'closeSettings':
          this.currentState = BuildkiteSidebarViewProviderState.main;
          this.refreshMainSidebarView(true);
          break;

        case 'settingsDetailsToggle':
          this.settingsDetailsState.set(message.section, message.isOpen);
          break;

        case 'askIde':
          if (this.repoName && this.currentBranch && this.buildkiteClient) {
            let newlyAddedPanel = false;
            if (!this.analyzerPanels[message.jobId]) {
              this.analyzerPanels[message.jobId] = new BuildkiteJobAnalyzer(
                message.jobId,
                message.jobName,
                this.context,
              );
              newlyAddedPanel = true;
            }
            if (
              this.analyzerPanels[message.jobId]!.isOpen() &&
              !newlyAddedPanel
            ) {
              this.analyzerPanels[message.jobId]!.reveal();
            } else {
              await this.analyzerPanels[message.jobId]!.open(
                this.latestBuild!,
                this.buildkiteClient,
                message.triggeredBuildData === 'undefined'
                  ? undefined
                  : message.triggeredBuildData,
              );
            }
          }
          break;

        case 'askClaude':
          if (this.repoName && this.currentBranch && this.buildkiteClient) {
            try {
              const triggeredBuildUrl =
                message.triggeredBuildData === 'undefined'
                  ? undefined
                  : message.triggeredBuildData;

              const result = await resolveJobErrors(
                this.latestBuild!,
                message.jobId,
                this.buildkiteClient,
                triggeredBuildUrl,
              );

              if (!result) {
                vscode.window.showWarningMessage(
                  'No failed job found or could not fetch job log.',
                );
                return;
              }

              if (!result.errors.length) {
                vscode.window.showInformationMessage('No errors found in log.');
                return;
              }

              const prompt = buildAnalysisPrompt(result.errors.join('\n'));
              await askClaude(prompt, createDefaultDependencies());
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to prepare Claude analysis: ${e instanceof Error ? e.message : e}`,
              );
            }
          }
          break;
      }
    });

    this.webviewParent?.onDidDispose(() => {
      // Keep polling and status bar running in the background
      this.webviewParent = undefined;
      this.webview = undefined;
      this.currentState = BuildkiteSidebarViewProviderState.main;
    });
  }

  resetSidebarView(message?: string) {
    if (this.webview) {
      switch (this.currentState) {
        case BuildkiteSidebarViewProviderState.main:
          this.webview.html = this.getSidebarHtml(
            this.currentBranch,
            message ? `<section>${message}</section>` : undefined,
          );
          break;

        case BuildkiteSidebarViewProviderState.settings:
          this.webview.html = this.getSidebarHtml(
            this.currentBranch,
            `<section class="h-full">
              <h3>Settings</h3>
              <details data-section="jobStatesFilter" ${this.settingsDetailsState.isOpen('jobStatesFilter') ? 'open' : ''}>
                <summary>Filter jobs by state:</summary>
                <div class="filter-buttons mt-1">
                  ${Object.values(BkState)
                    .map(
                      (state) =>
                        `<button class="filter-button ${this.jobStatesFilter.includes(state) ? 'active' : ''}" data-job-state="${state}">${state.toUpperCase()}</button>`,
                    )
                    .join('')}
                </div>
              </details>
              <br />
              <details data-section="autoRefresh" ${this.settingsDetailsState.isOpen('autoRefresh') ? 'open' : ''}>
                <summary>Auto-refresh settings:</summary>
                <div class="auto-refresh-settings mt-1">
                  <p>Auto-refresh interval: ${AUTO_REFRESH_INTERVAL}s</p>
                  ${
                    this.isAutoRefreshPaused
                      ? `<p class="tip-box mt-1 text-sm text-italic">Note: Auto-refresh is currently paused because the latest build is not running/failing/cancelling.</p>`
                      : ''
                  }
                </div>
              </details>
              <br />
              <button id="closeSettingsBtn" class="w-full mt-1">Back</button>
            </section>
            `,
          );
          break;
      }
    }
  }

  // Update the sidebar view with the latest Buildkite data
  async refreshMainSidebarView(skipChecks = false) {
    if (this.currentState !== BuildkiteSidebarViewProviderState.main) {
      return;
    }

    if (!skipChecks) {
      // Re-check repo name and branch in case of changes
      if (!this.repoName) {
        this.resetSidebarView('Not a Git repository or no origin URL found.');
        return;
      }

      this.currentBranch = await getCurrentBranch();
      if (!this.currentBranch) {
        this.resetSidebarView('Could not determine current Git branch.');
        return;
      }

      // Initialize Buildkite client (and reauth) if not already or if branch has changed
      if (
        !this.buildkiteClient ||
        !this.isInitialized ||
        this.buildkiteClient.branch !== this.currentBranch
      ) {
        // Check CLI installation
        if (!this.buildkiteClient) {
          this.buildkiteClient = new BuildkiteClient(
            this.repoName,
            this.currentBranch,
          );
        } else {
          this.buildkiteClient.branch = this.currentBranch;
        }

        const hasBkCli = await this.buildkiteClient.hasCli();
        if (!hasBkCli) {
          this.resetSidebarView(
            `<p class="mb-1">Buildkite CLI not found.</p>
          <button id="bkCliInstallBtn" class="w-full">Install CLI</button>`,
          );
          return;
        }

        // Check CLI auth
        const isAuthenticated = await this.buildkiteClient.whoami();
        if (!isAuthenticated) {
          this.resetSidebarView(
            `<p class="mb-1">Not authenticated with Buildkite CLI.</p>
          <button id="bkCliAuthBtn" class="w-full">Authenticate to CLI</button>
          <p class="tip-box mt-1 text-sm text-italic">Note: You may need to SSO into your organization before authenticating.</p>`,
          );
          return;
        }
      }
    }

    this.isInitialized = true;
    this.setupPolling();

    const jobsHtml = await this.generateJobsHtml(skipChecks);
    if (this.webview) {
      this.webview.html = this.getSidebarHtml(this.currentBranch, jobsHtml);
    }
  }

  async generateJobsHtml(skipChecks = false): Promise<string> {
    try {
      if (!skipChecks) {
        this.latestBuild = await this.buildkiteClient?.getLatestBuild();
      }

      if (!this.latestBuild) {
        const { message, status } = getBuildStatusBarState(undefined);
        this.setStatusBarMessage(message, status);
        return '<section>No builds found for this branch.</section>';
      }

      if (!this.latestBuild.jobs || this.latestBuild.jobs.length === 0) {
        this.setStatusBarMessage('No jobs found', 'info');
        return '<section>No jobs found for the latest build.</section>';
      }

      const { message, status } = getBuildStatusBarState(this.latestBuild);
      this.setStatusBarMessage(message, status);

      const refreshInfo = this.isAutoRefreshPaused
        ? ' (auto-refresh paused since build is not running)'
        : ` (auto-refresh every ${AUTO_REFRESH_INTERVAL}s)`;

      return (
        `<section class="border-top pt-1">
          <div class="build-header">
            <b>Latest Build Jobs</b>
            <div class="build-controls">
              <a id="openBuildBtn" href="${this.latestBuild.webUrl}" title="Open build in Buildkite"></a>
              <button id="refreshBtn" title="Manual refresh${refreshInfo}"></button>
              <button id="settingsBtn" title="Settings"></button>
            </div>
          </div>
        </section>` +
        '<ul class="job-list">' +
        this.latestBuild.jobs
          .map((job: BkJob) =>
            !(job.state === undefined || job.state === 'broken')
              ? `<li class="job${this.jobStatesFilter.includes(job.state) ? '' : ' hidden'}">
                    <div class="job-header">
                      <p>${escapeHtml(renderEmojiShortcodes(job.name || job.type || ''))}</p>
                      <b class="job-state ${job.state}">${job.state}</b>
                    </div>
                    ${
                      job.state === 'failed'
                        ? `<div class="job-controls">
                          <button class="job-ask-ide-btn" data-job-id="${job.id}" data-job-name="${escapeHtml(job.name)}" data-triggered-build="${job.triggered_build?.url}">${getIdeButtonLabel()}</button>
                          <button class="job-ask-claude-btn" data-job-id="${job.id}" data-job-name="${escapeHtml(job.name)}" data-triggered-build="${job.triggered_build?.url}">Ask Claude</button>
                        </div>`
                        : ''
                    }
                  </li>`
              : '',
          )
          .join('') +
        '</ul>'
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) {
        this.setStatusBarMessage('No Buildkite pipeline', 'info');
        return '<div>No Buildkite pipeline found for this repository.</div>';
      }
      this.setStatusBarMessage('Buildkite fetch error', 'error');
      return `<div class="fetch-error">Error fetching Buildkite data: ${e instanceof Error ? e.message : e}</div>`;
    }
  }

  getSidebarHtml(currentBranch?: string, contentHtml?: string): string {
    const nonce = getNonce();
    const cspSource = this.webview!.cspSource;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy"
        content="
          default-src 'none';
          img-src ${cspSource} https:;
          style-src ${cspSource};
          script-src ${cspSource} 'nonce-${nonce}';
        ">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Build Detective</title>
      ${this.webviewResourceUris.css.map((uri) => `<link href="${uri}" rel="stylesheet" />`).join('')}
      ${this.webviewResourceUris.js.map((uri) => `<script nonce="nonce-${nonce}" src="${uri}"></script>`).join('')}
    </head>
    <body>
      <div id="content">
        <section name="header">
            ${
              currentBranch
                ? `<p class="info">Current branch: <b>${currentBranch}</b></p>`
                : '<p class="info">Retrieving current branch...</p>'
            }
            
        </section>
        ${contentHtml ?? ''}

      </div>
    </body>
    </html>
  `;
  }

  setStatusBarMessage(message: string, status: StatusBarStatus = 'info') {
    if (!this.statusBar) {
      return;
    }

    let icon = '$(info) ';
    this.statusBar.color = undefined;

    switch (status) {
      case 'loading':
        icon = '$(sync~spin) ';
        this.statusBar.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.background',
        );
        break;
      case 'info':
        this.statusBar.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.background',
        );
        break;
      case 'success':
        icon = '$(check) ';
        this.statusBar.color = new vscode.ThemeColor('testing.iconPassed');
        this.statusBar.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.background',
        );
        break;
      case 'warning':
        icon = '$(alert) ';
        this.statusBar.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground',
        );
        break;
      case 'error':
        icon = '$(bug) ';
        this.statusBar.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground',
        );
        break;
    }
    this.statusBar.text = `${icon}${message}`;
    this.statusBar.show();
  }

  onBranchChange() {
    if (!this.isInitialized) {
      return;
    }

    this.currentState = BuildkiteSidebarViewProviderState.main;
    this.setStatusBarMessage('Refreshing...', 'loading');
    this.resetSidebarView('Branch changed, refreshing Buildkite data...');
    this.refreshMainSidebarView();
  }

  onCommitChange() {
    if (!this.isInitialized) {
      return;
    }

    this.currentState = BuildkiteSidebarViewProviderState.main;
    this.setStatusBarMessage('Refreshing...', 'loading');
    this.resetSidebarView('New commit detected, refreshing Buildkite data...');
    this.refreshMainSidebarView();
  }

  setupPolling() {
    if (this.pollingInterval) {
      return;
    }

    this.pollingInterval = setInterval(() => {
      if (RUNNING_STATES.includes(this.latestBuild?.state as BkState)) {
        this.refreshMainSidebarView();
      }
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  dispose() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    this.statusBar?.dispose();
    this.statusBar = undefined;
  }
}
