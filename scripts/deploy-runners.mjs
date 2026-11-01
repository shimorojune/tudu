#!/usr/bin/env node
// Deploys run on GitHub's own runners and Dokploy pulls the images from GHCR (docs/plans/hosted-deploy-runners.md).
// `node scripts/deploy-runners.mjs` fails when a workflow or compose file drifts back: a self-hosted job, a local
// image, an image built for the wrong architecture, Dokploy's key outside an environment, or a rehearsal that pushes.
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
