#!/usr/bin/env node
// Deploys run on GitHub's own runners and Dokploy pulls the images from GHCR (docs/plans/hosted-deploy-runners.md).
// `node scripts/deploy-runners.mjs` fails when a workflow or compose file drifts back: a self-hosted job, a local
// image, an image built for the wrong architecture, Dokploy's key outside an environment, or a rehearsal that pushes.
// CI secrets come from Infisical through OIDC (docs/plans/infisical-secrets.md): no workflow reads a GitHub secret but
// GITHUB_TOKEN, and every Infisical step is pinned, scoped to a master-only environment and forgotten after use.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IMAGES = ['tudu-api', 'tudu-web', 'tudu-mcp'];

/** The jobs of a workflow, as { name: text }, split on the two-space job keys under `jobs:`. */
export function jobsOf(workflow) {
  const at = workflow.search(/^jobs:\s*$/m);
  if (at < 0) return {};
  const body = workflow.slice(at).split('\n').slice(1).join('\n');
  const jobs = {};
  let name = null;
  for (const line of body.split('\n')) {
    const m = /^ {2}([\w-]+):\s*$/.exec(line);
    if (m) {
      name = m[1];
      jobs[name] = '';
    } else if (name) jobs[name] += line + '\n';
  }
  return jobs;
}

/** The steps of a job, split on `      - `. */
const stepsOf = (job) => job.split(/^ {6}- /m).slice(1);

const runsOn = (job) => {
  const m = /^ {4}runs-on:\s*(.+)$/m.exec(job);
  return m ? m[1].trim() : '';
};

/** Problems in the workflows, as lines; empty when every rule holds. */
export function checkWorkflows(workflows) {
  const problems = [];
  for (const [file, text] of Object.entries(workflows)) {
    for (const [name, job] of Object.entries(jobsOf(text))) {
      const where = `${file} › ${name}`;
      if (/self-hosted/.test(runsOn(job))) problems.push(`${where}: runs on a self-hosted runner`);
      const loadsDokploy = stepsOf(job).some(
        (st) => INFISICAL.test(st) && /secret-path:\s*\/dokploy\b/.test(st),
      );
      if ((/secrets\.DOKPLOY_/.test(job) || loadsDokploy) && !/^ {4}environment:/m.test(job))
        problems.push(`${where}: uses Dokploy secrets without an environment`);
      for (const step of stepsOf(job)) {
        if (!/uses:\s*docker\/build-push-action/.test(step)) continue;
        if (!/platforms:\s*linux\/arm64\s*$/m.test(step))
          problems.push(`${where}: image not built for linux/arm64`);
        if (!/-arm\b/.test(runsOn(job))) problems.push(`${where}: image build not on an arm64 runner`);
      }
    }
  }
  return problems;
}

const INFISICAL = /uses:\s*Infisical\/secrets-action@/;
const field = (step, key) => new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(step)?.[1] ?? '';

/** No workflow reads a GitHub secret other than GITHUB_TOKEN (the rest live in Infisical). */
export function checkSecrets(workflows) {
  const problems = [];
  for (const [file, text] of Object.entries(workflows))
    for (const [expr] of text.matchAll(/\$\{\{[\s\S]*?\}\}/g))
      for (const [, name] of expr.matchAll(/\bsecrets\.(\w+)/g))
        if (name !== 'GITHUB_TOKEN') problems.push(`${file}: reads the GitHub secret ${name}`);
  return [...new Set(problems)];
}

/** Every Infisical step: pinned, OIDC, configured from variables, in a master-only environment, forgotten after. */
export function checkInfisical(workflows) {
  const problems = [];
  for (const [file, text] of Object.entries(workflows)) {
    const top = text.slice(0, Math.max(0, text.search(/^jobs:\s*$/m)));
    if (/id-token:\s*write/.test(top)) problems.push(`${file}: id-token: write at workflow level`);
    for (const [name, job] of Object.entries(jobsOf(text))) {
      const where = `${file} › ${name}`;
      const steps = stepsOf(job);
      const environment = /^ {4}environment:\s*(.+)$/m.exec(job)?.[1] ?? '';
      steps.forEach((step, i) => {
        if (!INFISICAL.test(step)) return;
        if (!/Infisical\/secrets-action@[0-9a-f]{40}\b/.test(step))
          problems.push(`${where}: Infisical action not pinned to a commit`);
        if (field(step, 'method') !== 'oidc') problems.push(`${where}: Infisical login is not OIDC`);
        for (const [key, v] of [
          ['identity-id', 'INFISICAL_IDENTITY_ID'],
          ['domain', 'INFISICAL_URL'],
          ['project-id', 'INFISICAL_PROJECT'],
        ])
          if (field(step, key) !== `\${{ vars.${v} }}`)
            problems.push(`${where}: Infisical ${key} is not vars.${v}`);
        if (!environment) problems.push(`${where}: loads Infisical secrets without an environment`);
        if (!/^ {4}permissions:\s*$[\s\S]*?^ {6}id-token:\s*write/m.test(job))
          problems.push(`${where}: Infisical step without job-level id-token: write`);
        const slug = field(step, 'env-slug');
        if (slug === 'prod' && !/release/.test(environment))
          problems.push(`${where}: prod secrets outside release`);
        if (slug === 'staging' && !/staging/.test(environment))
          problems.push(`${where}: staging secrets outside staging`);
        if (/rehearsal/.test(environment) && !/^\s*if:.*(pull_request|REHEARSAL != 'true')/m.test(step))
          problems.push(`${where}: Infisical step also runs on rehearsals`);
        const forget = steps.findIndex((st, j) => j > i && /name:\s*Forget the Infisical secrets/.test(st));
        const rest = forget < 0 ? steps.slice(i + 2) : steps.slice(i + 1, forget);
        if (forget < 0 && rest.length) problems.push(`${where}: Infisical secrets not forgotten after use`);
        const code = (st) => st.replace(/^\s*#.*$/gm, '');
        if (forget >= 0 && rest.some((st) => /pnpm install/.test(code(st))))
          problems.push(`${where}: pnpm install runs before the Infisical secrets are forgotten`);
      });
    }
  }
  return problems;
}

/** Rehearsals of the release never log in to or push to the registry. */
export function checkRehearsal(release) {
  const problems = [];
  for (const [name, job] of Object.entries(jobsOf(release)))
    for (const step of stepsOf(job)) {
      if (/uses:\s*docker\/login-action/.test(step) && !/if:\s*env\.REHEARSAL != 'true'/.test(step))
        problems.push(`release.yml › ${name}: registry login also on rehearsals`);
      if (
        /uses:\s*docker\/build-push-action/.test(step) &&
        !/push:\s*\$\{\{\s*env\.REHEARSAL != 'true'\s*\}\}/.test(step)
      )
        problems.push(`release.yml › ${name}: image pushed on rehearsals`);
      if (/name:\s*A throwaway updater key/.test(step) && !/if:\s*env\.REHEARSAL == 'true'/.test(step))
        problems.push(`release.yml › ${name}: throwaway updater key outside rehearsals`);
      if (
        INFISICAL.test(step) &&
        /secret-path:\s*\/signing\b/.test(step) &&
        !/if:\s*env\.REHEARSAL != 'true'/.test(step)
      )
        problems.push(`release.yml › ${name}: real updater key loaded on rehearsals`);
    }
  return problems;
}

/** Each Tudu service in a deployment's compose pulls `ghcr.io/shimorojune/<image>:<track>` on every deploy. */
export function checkCompose(track, compose) {
  const problems = [];
  for (const image of IMAGES) {
    const want = `image: ghcr.io/shimorojune/${image}:${track}`;
    const at = compose.indexOf(want);
    if (at < 0) {
      problems.push(`${track} compose: ${image} is not ${want.slice(7)}`);
      continue;
    }
    const next = compose.slice(at).split('\n')[1] ?? '';
    if (!/^\s*pull_policy:\s*always\s*$/.test(next))
      problems.push(`${track} compose: ${image} needs pull_policy: always right after its image`);
  }
  if (/pull_policy:\s*never/.test(compose)) problems.push(`${track} compose: pull_policy: never left in`);
  return problems;
}

export function checkRepo(root) {
  const dir = join(root, '.github/workflows');
  const workflows = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => [f, readFileSync(join(dir, f), 'utf8')]),
  );
  return [
    ...checkWorkflows(workflows),
    ...checkSecrets(workflows),
    ...checkInfisical(workflows),
    ...checkRehearsal(workflows['release.yml'] ?? ''),
    ...['staging', 'production'].flatMap((t) =>
      checkCompose(t, readFileSync(join(root, `infra/${t}/compose.yaml`), 'utf8')),
    ),
  ];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const problems = checkRepo(new URL('..', import.meta.url).pathname);
  for (const p of problems) console.error(p);
  process.exit(problems.length ? 1 : 0);
}
