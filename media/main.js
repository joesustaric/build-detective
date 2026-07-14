const vscode = acquireVsCodeApi();

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bkCliInstallBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'bkCliInstall' });
  });

  document.getElementById('bkCliAuthBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'bkCliAuth' });
  });

  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'refreshBuild' });
  });

  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openSettings' });
  });

  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'closeSettings' });
  });

  document.querySelectorAll('.job-ask-ide-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const jobId = button.getAttribute('data-job-id');
      const jobName = button.getAttribute('data-job-name');
      const triggeredBuildData = button.getAttribute('data-triggered-build');
      if (jobId) {
        vscode.postMessage({
          command: 'askIde',
          jobId,
          jobName,
          triggeredBuildData,
        });
      }
    });
  });

  document.querySelectorAll('.job-ask-claude-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const jobId = button.getAttribute('data-job-id');
      const jobName = button.getAttribute('data-job-name');
      const triggeredBuildData = button.getAttribute('data-triggered-build');
      if (jobId) {
        vscode.postMessage({
          command: 'askClaude',
          jobId,
          jobName,
          triggeredBuildData,
        });
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-button')) {
      const state = e.target.getAttribute('data-job-state');
      if (state) {
        e.target.classList.toggle('active');
        vscode.postMessage({
          command: e.target.classList.contains('active')
            ? 'addJobStateFilter'
            : 'removeJobStateFilter',
          state,
        });
      }
    }
  });

  document
    .querySelectorAll('details[data-section]')
    .forEach((detailsElement) => {
      detailsElement.addEventListener('toggle', () => {
        vscode.postMessage({
          command: 'settingsDetailsToggle',
          section: detailsElement.getAttribute('data-section'),
          isOpen: detailsElement.open,
        });
      });
    });
});
