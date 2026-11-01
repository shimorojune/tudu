import { describe, expect, it } from 'vitest';
import { checkCompose, checkRehearsal, checkRepo, checkWorkflows } from './deploy-runners.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const build = (runsOn, platform = 'linux/arm64') =>
  `jobs:\n  images:\n    runs-on: ${runsOn}\n    steps:\n      - uses: docker/build-push-action@v6\n        with:\n          platforms: ${platform}\n`;

const compose = (track, policy = 'always', image = 'tudu-api') =>
  ['tudu-api', 'tudu-web', 'tudu-mcp']
    .map((i) =>
      i === image
        ? `  ${i}:\n    image: ghcr.io/shimorojune/${i}:${track}\n    pull_policy: ${policy}\n`
        : `  ${i}:\n    image: ghcr.io/shimorojune/${i}:${track}\n    pull_policy: always\n`,
    )
    .join('');

describe('scripts/deploy-runners', () => {
  it('C01-U20 the repo as it is: no self-hosted job, registry images, arm64 builds, secrets behind environments', () => {
    expect(checkRepo(ROOT)).toEqual([]);
  });

  it('C01-U20 a self-hosted job is named', () => {
    expect(
      checkWorkflows({
        'deploy-staging.yml': 'jobs:\n  smoke:\n    runs-on: [self-hosted, dokploy-deploy]\n',
      }),
    ).toEqual(['deploy-staging.yml › smoke: runs on a self-hosted runner']);
  });

  it('C01-U21 a local image, a wrong track or pull_policy: never is refused', () => {
    expect(checkCompose('staging', compose('staging'))).toEqual([]);
    expect(checkCompose('staging', compose('staging', 'never'))).toEqual([
      'staging compose: tudu-api needs pull_policy: always right after its image',
      'staging compose: pull_policy: never left in',
    ]);
    expect(checkCompose('production', compose('staging'))).toHaveLength(3);
    expect(checkCompose('staging', 'services:\n  api:\n    image: tudu-api:staging\n')).toContain(
      'staging compose: tudu-api is not ghcr.io/shimorojune/tudu-api:staging',
    );
  });

  it('C01-U22 an image build must be linux/arm64 on an arm64 runner', () => {
    expect(checkWorkflows({ 'a.yml': build('ubuntu-24.04-arm') })).toEqual([]);
    expect(checkWorkflows({ 'a.yml': build('ubuntu-latest') })).toEqual([
      'a.yml › images: image build not on an arm64 runner',
    ]);
    expect(checkWorkflows({ 'a.yml': build('ubuntu-24.04-arm', 'linux/amd64') })).toEqual([
      'a.yml › images: image not built for linux/arm64',
    ]);
  });

  it('C01-U23 Dokploy secrets only in a job with an environment', () => {
    const job = (env) =>
      `jobs:\n  deploy:\n    runs-on: ubuntu-latest\n${env}    steps:\n      - env:\n          K: \${{ secrets.DOKPLOY_API_KEY }}\n`;
    expect(checkWorkflows({ 'a.yml': job('    environment: staging\n') })).toEqual([]);
    expect(checkWorkflows({ 'a.yml': job('') })).toEqual([
      'a.yml › deploy: uses Dokploy secrets without an environment',
    ]);
  });

  it('C01-U24 a release rehearsal never logs in or pushes', () => {
    const release = (loginIf, push) =>
      `jobs:\n  images:\n    runs-on: ubuntu-24.04-arm\n    steps:\n      - uses: docker/login-action@v3\n${loginIf}      - uses: docker/build-push-action@v6\n        with:\n          push: ${push}\n`;
    expect(
      checkRehearsal(release("        if: env.REHEARSAL != 'true'\n", "${{ env.REHEARSAL != 'true' }}")),
    ).toEqual([]);
    expect(checkRehearsal(release('', 'true'))).toEqual([
      'release.yml › images: registry login also on rehearsals',
      'release.yml › images: image pushed on rehearsals',
    ]);
  });
});
