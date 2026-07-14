import * as vscode from 'vscode';
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

const CSS_FILES = ['style.css'];
const JS_FILES = ['main.js'];

export const getGitOriginUrl = async (): Promise<string | undefined> => {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const cwd = folders[0].uri.fsPath;
      const { stdout } = await exec('git config --get remote.origin.url', {
        cwd,
      });
      const origin = stdout.trim();
      return origin;
    }
  } catch (err) {
    console.log('Could not get git origin:', err);
  }
  return undefined;
};

export const getCurrentBranch = async (): Promise<string | undefined> => {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const cwd = folders[0].uri.fsPath;
      const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', {
        cwd,
      });
      let currentBranch = stdout.trim();
      console.log('Current Git branch:', currentBranch);
      return currentBranch;
    }
  } catch (err) {
    console.log('Could not get current branch:', err);
  }
  return undefined;
};

export function extractRepoName(gitUrl: string): string | undefined {
  const match = gitUrl.match(/[:\/]([^\/:]+)\.git$/);
  return match ? match[1] : undefined;
}

export function openHtmlWebviewPanel(title: string, html: string) {
  const panel = vscode.window.createWebviewPanel(
    'customHtmlWebview',
    title,
    vscode.ViewColumn.Active,
    { enableScripts: true },
  );
  panel.webview.html = html;
  return panel;
}

// Map of common emoji shortcodes to Unicode characters.
// Covers the most frequently seen ones in Buildkite job names.
const EMOJI_MAP: Record<string, string> = {
  rocket: '🚀',
  white_check_mark: '✅',
  x: '❌',
  warning: '⚠️',
  tada: '🎉',
  fire: '🔥',
  hammer: '🔨',
  wrench: '🔧',
  gear: '⚙️',
  mag: '🔍',
  lock: '🔒',
  key: '🔑',
  bulb: '💡',
  package: '📦',
  ship: '🚢',
  rotating_light: '🚨',
  construction: '🚧',
  checkered_flag: '🏁',
  test_tube: '🧪',
  memo: '📝',
  computer: '💻',
  cloud: '☁️',
  zap: '⚡',
  recycle: '♻️',
  hourglass: '⏳',
  hourglass_flowing_sand: '⏳',
  clock1: '🕐',
  arrow_up: '⬆️',
  arrow_down: '⬇️',
  heavy_check_mark: '✔️',
  heavy_multiplication_x: '✖️',
  no_entry: '⛔',
  no_entry_sign: '🚫',
  stop_sign: '🛑',
  green_heart: '💚',
  red_circle: '🔴',
  large_green_circle: '🟢',
  large_yellow_circle: '🟡',
};

/**
 * Convert Buildkite/Slack-style emoji shortcodes in a string.
 * Known shortcodes become Unicode characters; unknown ones (e.g. `:kubernetes:`)
 * have their colons stripped and are padded with spaces so adjacent shortcodes
 * don't concatenate (`:kubernetes::rocket:` → `kubernetes 🚀`).
 */
export function renderEmojiShortcodes(text: string): string {
  return text
    .replace(/:([a-z0-9_-]+):/gi, (_match, name) => {
      if (EMOJI_MAP[name]) {
        return EMOJI_MAP[name];
      }
      // Pad unknown shortcodes with spaces to avoid concatenation with adjacent tokens
      return ` ${name} `;
    })
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export const escapeHtml = (text: string): string => {
  return text.replace(/[&<>"']/g, function (c) {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ] || c
    );
  });
};

export const getWebviewResourceUri = (
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  filename: string,
): vscode.Uri => {
  return webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', filename),
  );
};

export const getWebviewResourceUris = (
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): { css: vscode.Uri[]; js: vscode.Uri[] } => {
  return {
    css: CSS_FILES.map((file) =>
      getWebviewResourceUri(webview, extensionUri, file),
    ),
    js: JS_FILES.map((file) =>
      getWebviewResourceUri(webview, extensionUri, file),
    ),
  };
};

export const getIdeButtonLabel = (): string => {
  return vscode.env.appName === 'Cursor' ? 'Ask Cursor' : 'Ask Copilot';
};
