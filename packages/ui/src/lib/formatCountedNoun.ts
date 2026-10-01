import pluralize from "pluralize";

export function formatCountedNoun(count: number, singular: string): string {
  return pluralize(singular, count, true);
}
