import * as vscode from 'vscode';
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

export type BkJob = {
  id: string;
  state: string;
  name: string;
  type: string;
  rawJobUrl: string;
  triggered_build?: {
    id: string;
    number: number;
    url: string;
    webUrl: string;
  };
};

export type BkBuild = {
  id: string;
  number: number;
  state: string;
  message?: string;
  jobs?: BkJob[];
  url: string;
  webUrl: string;
  pipelineSlug?: string;
};

export type BkBuildRef = {
  pipelineSlug: string;
  buildNumber: string;
};

export type BkBuildLogRef = BkBuildRef & {
  jobId: string;
};

export enum BkState {
  creating = 'creating',
  scheduled = 'scheduled',
  running = 'running',
  passed = 'passed',
  failing = 'failing',
  failed = 'failed',
  blocked = 'blocked',
  canceling = 'canceling',
  canceled = 'canceled',
  skipped = 'skipped',
  not_run = 'not_run',
}

export const RUNNING_STATES: BkState[] = [
  BkState.running,
  BkState.failing,
  BkState.canceling,
];

export const DEFAULT_JOB_STATES_FILTER: BkState[] = [
  BkState.creating,
  BkState.scheduled,
  BkState.running,
  BkState.passed,
  BkState.failing,
  BkState.failed,
  // BkState.blocked,
  // BkState.canceling,
  // BkState.canceled,
  // BkState.skipped,
  // BkState.not_run,
];

export class BuildkiteClient {
  static instance: BuildkiteClient | null = null;

  private pipelineSlug: string;
  branch: string;

  constructor(pipelineSlug: string, branch: string) {
    if (!BuildkiteClient.instance) {
      BuildkiteClient.instance = this;
    }

    this.pipelineSlug = pipelineSlug;
    this.branch = branch;
  }

  static extractBuildRef(buildUrl: string): BkBuildRef | undefined {
    try {
      const path = new URL(buildUrl).pathname;
      const match = path.match(
        /^\/v2\/organizations\/[^/]+\/pipelines\/([^/]+)\/builds\/(\d+)\/?$/,
      );

      if (!match) {
        return undefined;
      }

      return {
        pipelineSlug: match[1],
        buildNumber: match[2],
      };
    } catch {
      return undefined;
    }
  }

  static extractBuildLogRef(logUrl: string): BkBuildLogRef | undefined {
    try {
      const path = new URL(logUrl).pathname;
      const match = path.match(
        /^\/v2\/organizations\/[^/]+\/pipelines\/([^/]+)\/builds\/(\d+)\/jobs\/([^/]+)\/log\.txt\/?$/,
      );
      if (!match) {
        return undefined;
      }

      return {
        pipelineSlug: match[1],
        buildNumber: match[2],
        jobId: match[3],
      };
    } catch {
      return undefined;
    }
  }

  static extractErrorSnippets(fullLog: string): {
    errors: string[];
    fullLog: string;
  } {
    const lines = fullLog.split('\n');
    const errorEndRegex = / Error:/;
    const sectionStartRegex = /^\[\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)\]\s*---/;

    let endIdx = lines.findIndex((line) => errorEndRegex.test(line));
    if (endIdx === -1) {
      return { errors: [], fullLog };
    }

    let startIdx = -1;
    for (let i = endIdx; i >= 0; i--) {
      if (sectionStartRegex.test(lines[i])) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) {
      startIdx = Math.max(0, endIdx - 50);
    }

    const errors = lines.slice(startIdx, endIdx + 1);
    return {
      errors: errors || [],
      fullLog,
    };
  }

  static normalizeLogTimestamps(logContent: string): string {
    // Buildkite log lines can contain either raw control chars or escaped unicode forms.
    const rawTokenRegex = /\x1b_bk;t=(\d+)\x07/g;
    const escapedTokenRegex = /\\u001b_bk;t=(\d+)\\u0007/g;

    const replacer = (_match: string, epochMs: string) => {
      const timeValue = Number(epochMs);
      if (!Number.isFinite(timeValue)) {
        return _match;
      }

      const formatted = new Date(timeValue).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      return `[${formatted}]`;
    };

    return logContent
      .replace(rawTokenRegex, replacer)
      .replace(escapedTokenRegex, replacer);
  }

  async hasCli(): Promise<boolean> {
    try {
      await exec('bk --version');
      return true;
    } catch (err) {
      console.log('Could not get Buildkite CLI version:', err);
    }
    return false;
  }

  async installBkCli(
    execFn: (cmd: string) => Promise<{ stdout: string; stderr: string }> = exec,
  ): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await execFn(
          'winget install buildkite.bk --accept-package-agreements --accept-source-agreements --silent',
        );
      } else {
        await execFn('brew install buildkite/buildkite/bk@3');
      }
      vscode.window.showInformationMessage(
        'Buildkite CLI installed successfully. Please refresh the view.',
      );
    } catch (err) {
      console.log('Error installing Buildkite CLI:', err);
      const message =
        process.platform === 'win32'
          ? 'Failed to auto-install Buildkite CLI via winget. Please install it manually from https://buildkite.com/docs/packages/cli and then refresh.'
          : 'Failed to install Buildkite CLI. Please install it manually from https://buildkite.com/docs/packages/cli and then refresh.';
      vscode.window.showErrorMessage(message);
    }
  }

  async whoami(): Promise<boolean> {
    try {
      await exec('bk whoami');
      return true;
    } catch (err) {
      console.log('Error running Buildkite CLI whoami:', err);
    }
    return false;
  }

  async authLogin(): Promise<void> {
    try {
      await exec('bk auth login --scopes "read_only"');
    } catch (err) {
      console.log('Error during Buildkite CLI auth login:', err);
      throw err;
    }
  }

  async getLatestBuild(): Promise<BkBuild | undefined> {
    try {
      const { stdout } = await exec(
        `bk build list --pipeline ${this.pipelineSlug} --branch ${this.branch} --json --limit 1`,
      );
      const builds = JSON.parse(stdout);
      if (builds.length > 0) {
        return this.mapToBkBuild(builds[0]);
      }
      return undefined;
    } catch (err) {
      console.log('Error fetching latest Buildkite build:', err);
    }
    return undefined;
  }

  async getBuildDetails(
    buildId: string,
    pipelineSlug?: string,
  ): Promise<BkBuild | undefined> {
    try {
      const pipelineArg = pipelineSlug || this.pipelineSlug;
      const { stdout } = await exec(
        `bk build view ${buildId} --pipeline ${pipelineArg} --json`,
      );
      const build = JSON.parse(stdout);
      return this.mapToBkBuild(build);
    } catch (err) {
      console.log('Error fetching Buildkite build details:', err);
    }
    return undefined;
  }

  async getJobLog(logUrl: string): Promise<string | undefined> {
    try {
      const buildLogRef = BuildkiteClient.extractBuildLogRef(logUrl);
      if (!buildLogRef) {
        vscode.window.showErrorMessage(
          `Could not parse build log URL: ${logUrl}`,
        );
        return undefined;
      }

      const stdout = await new Promise<string>((resolve, reject) => {
        const child = cp.spawn(
          'bk',
          [
            'job',
            'log',
            buildLogRef.jobId,
            '-p',
            buildLogRef.pipelineSlug,
            '-b',
            buildLogRef.buildNumber,
          ],
          { shell: false },
        );

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.stderr.on('data', (chunk: Buffer | string) => {
          errorOutput += chunk.toString();
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve(output);
            return;
          }

          reject(
            new Error(
              `bk job log failed with exit code ${code}: ${errorOutput.trim()}`,
            ),
          );
        });
      });

      const result = BuildkiteClient.normalizeLogTimestamps(stdout);

      return result || undefined;
    } catch (err) {
      console.log('Error fetching Buildkite job log:', err);
      return undefined;
    }
  }

  mapToBkBuild(build: any): BkBuild {
    return {
      id: build.id,
      number: build.number,
      message: build.message,
      state: build.state,
      jobs: build.jobs?.map((job: any) => this.mapToBkJob(job)) || [],
      url: build.url,
      webUrl: build.web_url,
      pipelineSlug: build.pipeline?.slug,
    };
  }

  mapToBkJob(job: any): BkJob {
    return {
      id: job.id,
      state: job.state,
      name: job.name,
      type: job.type,
      rawJobUrl: job.raw_log_url,
      triggered_build: job.triggered_build
        ? {
            id: job.triggered_build.id,
            number: job.triggered_build.number,
            url: job.triggered_build.url,
            webUrl: job.triggered_build.web_url,
          }
        : undefined,
    };
  }
}
