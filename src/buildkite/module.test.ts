import * as assert from 'assert';
import { getBuildStatusBarState } from './module';

suite('getBuildStatusBarState', () => {
  test('uses a neutral status when no build is available', () => {
    assert.deepStrictEqual(getBuildStatusBarState(undefined), {
      message: 'No builds found',
      status: 'info',
    });
  });
});
