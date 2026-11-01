import { describe, expect, it } from 'vitest';
import {
  checkCompose,
  checkInfisical,
  checkRehearsal,
  checkRepo,
  checkSecrets,
  checkWorkflows,
} from './deploy-runners.mjs';

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
  it('C01-U20 the repo as it is: no self-hosted job, registry images, arm64 builds, secrets from Infisical behind environments', () => {
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

  const PIN = 'Infisical/secrets-action@d2e351f16c6ca20d17c85e6c992e04bdeb64e87d';
  const infisical = ({
    pin = PIN,
    method = 'oidc',
    env = 'staging',
    path = '/dokploy',
    domain = 'INFISICAL_URL',
    iff = '',
  } = {}) =>
    `      - name: Secrets from Infisical\n${iff}        uses: ${pin}\n        with:\n          method: ${method}\n` +
    `          identity-id: \${{ vars.INFISICAL_IDENTITY_ID }}\n          domain: \${{ vars.${domain} }}\n` +
    `          project-id: \${{ vars.INFISICAL_PROJECT }}\n          env-slug: ${env}\n          secret-path: ${path}\n`;
  const forget = `      - name: Forget the Infisical secrets\n        run: printf '%s=\\n' DOKPLOY_API_KEY >> "$GITHUB_ENV"\n`;
  const deployJob = ({
    environment = '    environment: staging\n',
    perms = '    permissions:\n      contents: read\n      id-token: write\n',
    step = infisical(),
    after = forget + '      - run: pnpm install\n',
  } = {}) =>
    `permissions:\n  contents: read\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n${environment}${perms}    steps:\n${step}      - run: node scripts/dokploy-deploy.mjs\n${after}`;

  it('C01-U25 no workflow reads a GitHub secret but GITHUB_TOKEN', () => {
    expect(
      checkSecrets({ 'a.yml': 'x: ${{ secrets.GITHUB_TOKEN }}\n# docs/plans/infisical-secrets.md\n' }),
    ).toEqual([]);
    expect(
      checkSecrets({
        'a.yml':
          "k: ${{ inputs.t == 'p' && secrets.DOKPLOY_PRODUCTION_COMPOSE_ID || secrets.DOKPLOY_STAGING_COMPOSE_ID }}\n",
      }),
    ).toEqual([
      'a.yml: reads the GitHub secret DOKPLOY_PRODUCTION_COMPOSE_ID',
      'a.yml: reads the GitHub secret DOKPLOY_STAGING_COMPOSE_ID',
    ]);
  });

  it('C01-U26 an Infisical step is pinned to a commit, logs in with OIDC and is configured from variables', () => {
    expect(checkInfisical({ 'a.yml': deployJob() })).toEqual([]);
    expect(
      checkInfisical({
        'a.yml': deployJob({
          step: infisical({ pin: 'Infisical/secrets-action@v1.0.18', method: 'universal', domain: 'X' }),
        }),
      }),
    ).toEqual([
      'a.yml › deploy: Infisical action not pinned to a commit',
      'a.yml › deploy: Infisical login is not OIDC',
      'a.yml › deploy: Infisical domain is not vars.INFISICAL_URL',
    ]);
  });

  it('C01-U27 an Infisical step needs an environment and job-level id-token: write, never workflow-level', () => {
    expect(checkInfisical({ 'a.yml': deployJob({ environment: '' }) })).toEqual([
      'a.yml › deploy: loads Infisical secrets without an environment',
      'a.yml › deploy: staging secrets outside staging',
    ]);
    expect(checkWorkflows({ 'a.yml': deployJob({ environment: '' }) })).toEqual([
      'a.yml › deploy: uses Dokploy secrets without an environment',
    ]);
    expect(checkInfisical({ 'a.yml': deployJob({ perms: '' }) })).toEqual([
      'a.yml › deploy: Infisical step without job-level id-token: write',
    ]);
    expect(
      checkInfisical({ 'a.yml': deployJob().replace('  contents: read\njobs:', '  id-token: write\njobs:') }),
    ).toEqual(['a.yml: id-token: write at workflow level']);
  });

  it("C01-U28 the Infisical environment matches the job's, and rehearsals never load", () => {
    expect(checkInfisical({ 'a.yml': deployJob({ step: infisical({ env: 'prod' }) }) })).toEqual([
      'a.yml › deploy: prod secrets outside release',
    ]);
    const rehearsalEnv =
      "    environment: ${{ github.event_name == 'pull_request' && 'rehearsal' || 'release' }}\n";
    expect(
      checkInfisical({ 'a.yml': deployJob({ environment: rehearsalEnv, step: infisical({ env: 'prod' }) }) }),
    ).toEqual(['a.yml › deploy: Infisical step also runs on rehearsals']);
    expect(
      checkInfisical({
        'a.yml': deployJob({
          environment: rehearsalEnv,
          step: infisical({ env: 'prod', iff: "        if: github.event_name != 'pull_request'\n" }),
        }),
      }),
    ).toEqual([]);
  });

  it('C01-U29 Infisical secrets are forgotten before anything else runs', () => {
    expect(checkInfisical({ 'a.yml': deployJob({ after: '' }) })).toEqual([]);
    expect(checkInfisical({ 'a.yml': deployJob({ after: '      - run: pnpm install\n' }) })).toEqual([
      'a.yml › deploy: Infisical secrets not forgotten after use',
    ]);
    expect(checkInfisical({ 'a.yml': deployJob({ after: '      - run: pnpm install\n' + forget }) })).toEqual(
      ['a.yml › deploy: pnpm install runs before the Infisical secrets are forgotten'],
    );
  });

  it('C01-U31 a release rehearsal signs with a throwaway key, a real release with the Infisical one', () => {
    const macos = (throwawayIf, realIf) =>
      `jobs:\n  macos:\n    runs-on: macos-latest\n    steps:\n${infisical({ env: 'prod', path: '/signing', iff: realIf })}` +
      `      - name: A throwaway updater key for the rehearsal\n${throwawayIf}        run: pnpm exec tauri signer generate\n`;
    expect(
      checkRehearsal(macos("        if: env.REHEARSAL == 'true'\n", "        if: env.REHEARSAL != 'true'\n")),
    ).toEqual([]);
    expect(checkRehearsal(macos('', ''))).toEqual([
      'release.yml › macos: real updater key loaded on rehearsals',
      'release.yml › macos: throwaway updater key outside rehearsals',
    ]);
  });
});
