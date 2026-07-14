import * as assert from 'assert';
import { extractRepoName } from '../utils';

suite('extractRepoName', () => {
  test('parses SSH git URL', () => {
    assert.strictEqual(extractRepoName('git@github.com:example-org/my-repo.git'), 'my-repo');
  });

  test('parses HTTPS git URL', () => {
    assert.strictEqual(extractRepoName('https://github.com/example-org/my-repo.git'), 'my-repo');
  });

  test('returns undefined for URL without .git suffix', () => {
    assert.strictEqual(extractRepoName('https://github.com/example-org/my-repo'), undefined);
  });

  test('returns undefined for empty string', () => {
    assert.strictEqual(extractRepoName(''), undefined);
  });

  test('parses repo name with hyphens and numbers', () => {
    assert.strictEqual(extractRepoName('git@github.com:org/my-service-v2.git'), 'my-service-v2');
  });
});
