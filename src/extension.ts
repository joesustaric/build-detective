// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getGitApi } from './git';
import { BuildkiteSidebarViewProvider } from './buildkite/module';
import { getGitOriginUrl, extractRepoName } from './utils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const bkModule = new BuildkiteSidebarViewProvider(context);

  // Watch for Git branch/commit changes and refresh the sidebar view accordingly
  const git = await getGitApi();
  if (git) {
    const watchRepository = (repo: any) => {
      let currentBranch = repo.state.HEAD?.name;
      let currentCommit = repo.state.HEAD?.commit;

      const stateDisposable = repo.state.onDidChange(() => {
        const newBranch = repo.state.HEAD?.name;
        const newCommit = repo.state.HEAD?.commit;

        if (newBranch !== currentBranch) {
          currentBranch = newBranch;
          currentCommit = newCommit;
          bkModule.onBranchChange();
          return;
        }

        if (newCommit !== currentCommit) {
          currentCommit = newCommit;
          bkModule.onCommitChange();
        }
      });

      context.subscriptions.push(stateDisposable);
    };

    for (const repo of git.repositories) {
      watchRepository(repo);
    }

    const openRepoDisposable = git.onDidOpenRepository((repo: any) => {
      watchRepository(repo);
    });
    context.subscriptions.push(openRepoDisposable);
  }

  const gitOriginUrl = await getGitOriginUrl();
  if (gitOriginUrl) {
    bkModule.repoName = extractRepoName(gitOriginUrl);
    await bkModule.initialize();
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
