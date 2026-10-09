import assert from 'node:assert/strict';
import test from 'node:test';

enum RunnerProbe {
  Ok = 'ok'
}

test('compiled enum runs under node:test', () => {
  assert.equal(RunnerProbe.Ok, 'ok');
});
