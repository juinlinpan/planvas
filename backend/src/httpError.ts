export type ErrorDetail = {
  loc: Array<string | number>;
  msg: string;
  type: string;
};

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details: ErrorDetail[] | null = null,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class StorageInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageInitializationError';
  }
}

export function getErrorCode(statusCode: number): string {
  if (statusCode === 400) return 'bad_request';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 422) return 'validation_error';
  return statusCode === 500 ? 'internal_error' : 'request_error';
}

export function validationError(details: ErrorDetail[]): HttpError {
  return new HttpError(422, 'Request validation failed.', details);
}
