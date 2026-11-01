#!/usr/bin/env node
// Deploys run on GitHub's own runners and Dokploy pulls the images from GHCR (docs/plans/hosted-deploy-runners.md).
// `node scripts/deploy-runners.mjs` fails when a workflow or compose file drifts back: a self-hosted job, a local
// image, an image built for the wrong architecture, Dokploy's key outside an environment, or a rehearsal that pushes.
// CI secrets live in Infisical, which syncs them into the master-only GitHub environments `staging` and `release`
// (docs/plans/infisical-secrets.md): a workflow reads only those synced secrets, only in a job in one of those
// environments, only in a step's own env or with, and never on a rehearsal.
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
      if (/secrets\.DOKPLOY_/.test(job) && !/^ {4}environment:/m.test(job))
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

/** What Infisical syncs into the `staging` and `release` environments; GITHUB_TOKEN is GitHub's own. */
export const SYNCED = [
  'DOKPLOY_URL',
  'DOKPLOY_API_KEY',
  'DOKPLOY_COMPOSE_ID',
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'RELEASE_DEPLOY_KEY',
];

/** The secrets an expression reads, GITHUB_TOKEN aside, as [expression, name] pairs. */
const secretsIn = (text) =>
  [...text.matchAll(/\$\{\{[\s\S]*?\}\}/g)].flatMap(([expr]) =>
    [...expr.matchAll(/\bsecrets\.(\w+)/g)]
      .map(([, name]) => [expr, name])
      .filter(([, n]) => n !== 'GITHUB_TOKEN'),
  );

/** Every secret read is a synced one, in a step of a job in `staging` or `release`, and skipped on rehearsals. */
export function checkSecrets(workflows) {
  const problems = [];
  for (const [file, text] of Object.entries(workflows)) {
    const top = text.slice(0, Math.max(0, text.search(/^jobs:\s*$/m)));
    for (const [, name] of secretsIn(top)) problems.push(`${file}: reads ${name} outside a step`);
    for (const [job, body] of Object.entries(jobsOf(text))) {
      const where = `${file} › ${job}`;
      const environment = /^ {4}environment:\s*(.+)$/m.exec(body)?.[1] ?? '';
      const head = body.split(/^ {4}steps:\s*$/m)[0];
      for (const [, name] of secretsIn(head)) problems.push(`${where}: reads ${name} outside a step`);
      for (const step of stepsOf(body))
        for (const [expr, name] of secretsIn(step)) {
          if (!SYNCED.includes(name)) problems.push(`${where}: reads ${name}, which Infisical does not sync`);
          if (!/\b(staging|release)\b/.test(environment))
            problems.push(`${where}: reads ${name} outside the staging and release environments`);
          if (/rehearsal/.test(environment) && !/pull_request|REHEARSAL/.test(expr))
            problems.push(`${where}: reads ${name} on rehearsals`);
        }
    }
  }
  return [...new Set(problems)];
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
      // A dispatched rehearsal runs on master in `release`, so pull_request alone does not keep the real key out.
      for (const [expr, secret] of secretsIn(step))
        if (/^TAURI_SIGNING_/.test(secret) && !/env\.REHEARSAL [!=]= 'true'/.test(expr))
          problems.push(`release.yml › ${name}: real updater key read on rehearsals`);
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
