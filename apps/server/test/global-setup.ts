import type { TestProject } from 'vitest/node';
import { createTestDatabase } from '@tudu/db/test';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** One throwaway database for the whole run, dropped at the end. */
export default async function setup(project: TestProject) {
  const db = await createTestDatabase({ prefix: 'tudu_api' });
  project.provide('databaseUrl', db.url);
  return async () => {
    await db.drop();
  };
}
