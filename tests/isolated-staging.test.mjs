import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url); require('tsx/cjs');
const { getIsolatedStagingConfig, stagingPoolOptions } = require('../lib/staging/config.ts');
const base = { PADDLE_STAGING_PROFILE: 'isolated', DEPLOYMENT_ENV: 'staging', BILLING_DEPLOYMENT_ENV: 'sandbox',
  PADDLE_STAGING_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PADDLE_SANDBOX_ENTITLEMENTS_ENABLED: 'false', AUTH0_LINK_ENABLED: 'false',
  PADDLE_SANDBOX_ENABLED: 'false', PADDLE_RECONCILIATION_ENABLED: 'false', PADDLE_WEBHOOK_WORKER_ENABLED: 'false',
  APP_BASE_URL: 'https://sandbox.example.test', PADDLE_SANDBOX_DATABASE_URL: 'postgresql:///paddle_sandbox_test?host=/tmp/paddle-staging&user=paddle_staging_test' };
test('isolated staging requires explicit independent database, deployment identity and disabled activation/linking', () => {
  const config = getIsolatedStagingConfig(base);
  assert.equal(config.database, 'paddle_sandbox_test'); assert.equal(stagingPoolOptions(config).password, '');
  for (const key of Object.keys(base)) assert.throws(() => getIsolatedStagingConfig({ ...base, [key]: '' }), undefined, key);
  for (const override of [{ DATABASE_URL: 'postgres://production.invalid/db' }, { DEPLOYMENT_ENV: 'production' }, { VERCEL_ENV: 'preview' },
    { VERCEL: '1' }, { PADDLE_SANDBOX_ENTITLEMENTS_ENABLED: 'true' }, { AUTH0_LINK_ENABLED: 'true' }, { AUTH0_ISSUER: 'https://example.test/' },
    { PADDLE_SANDBOX_ENABLED: 'true' }, { PADDLE_WEBHOOK_WORKER_ENABLED: 'true' }, { PADDLE_RECONCILIATION_ENABLED: 'true' },
    { PADDLE_STAGING_ID: 'not-an-identity' }, { PADDLE_SANDBOX_API_KEY: 'pdl_live_apikey_synthetic' }, { PADDLE_SANDBOX_CLIENT_TOKEN: 'live_synthetic' }])
    assert.throws(() => getIsolatedStagingConfig({ ...base, ...override }));
  for (const url of ['postgres://localhost/paddle_sandbox_test', 'postgresql:///production?host=/tmp/test&user=paddle_staging_test',
    'postgresql:///paddle_sandbox_test?host=/tmp/test&user=postgres', 'postgresql:///paddle_sandbox_test?host=/tmp/test&user=paddle_staging_test&options=unsafe',
    base.PADDLE_SANDBOX_DATABASE_URL + '&host=/tmp/other', base.PADDLE_SANDBOX_DATABASE_URL + '#ignored'])
    assert.throws(() => getIsolatedStagingConfig({ ...base, PADDLE_SANDBOX_DATABASE_URL: url }));
});
test('private launcher rejects readable, symlinked, missing, repository and unapproved configuration without leaking content', async () => {
  const dir = await mkdtemp('/tmp/staging-launcher-'); const filename = dir + '/environment';
  const secret = 'synthetic-must-never-appear-in-logs';
  const run = (...args) => spawnSync(process.execPath, ['scripts/run-isolated-staging.mjs', ...args], { encoding: 'utf8' });
  try {
    await writeFile(filename, `UNAPPROVED=${secret}\n`, { mode: 0o600 });
    for (const args of [['preflight', filename], ['preflight', filename + '.missing'], ['web', process.cwd() + '/.env'], ['preflight', filename, 'extra']]) {
      const result = run(...args); assert.equal(result.status, 1); assert.ok(!result.stderr.includes(secret));
    }
    await chmod(filename, 0o644); assert.equal(run('preflight', filename).status, 1);
    await chmod(filename, 0o600); await symlink(filename, dir + '/link'); assert.equal(run('preflight', dir + '/link').status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
