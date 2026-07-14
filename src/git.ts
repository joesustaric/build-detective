import * as vscode from 'vscode';

export const getGitApi = async () => {
  const ext = vscode.extensions.getExtension('vscode.git');

  if (!ext) {
    console.error('Git extension not found');
    return;
  }

  const gitExtension = ext.isActive ? ext.exports : await ext.activate();

  return gitExtension.getAPI(1);
};
