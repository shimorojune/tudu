import type { JiraErrorCode } from '@tudu/core';

/**
 * An app said no, or did not answer: the code the panel reads, the words, the HTTP status the API answers with,
 * and the connect form's field the words belong under.
 */
export class ConnectorFailure extends Error {
  constructor(
    readonly code: JiraErrorCode,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 502,
    readonly field?: 'site' | 'token',
  ) {
    super(message);
  }
}
