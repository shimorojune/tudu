import type { TaskLink } from '@tudu/core';
import { schema, sql } from '@tudu/db';

/** A task's links to outside issues, one per app in the apps' order: the row's `links`. */
export const linksColumn = sql<
  TaskLink[]
>`coalesce((select json_agg(json_build_object('provider', ${schema.taskLinks.provider}, 'key', ${schema.taskLinks.key}) order by ${schema.taskLinks.provider}) from ${schema.taskLinks} where ${schema.taskLinks.taskId} = ${schema.tasks.id}), '[]'::json)`;

/** A word found in one of a task's link keys, for the search's candidates. */
export function linkKeyLike(pattern: string) {
  return sql`exists (select 1 from ${schema.taskLinks} where ${schema.taskLinks.taskId} = ${schema.tasks.id} and ${schema.taskLinks.key} ILIKE ${pattern})`;
}
