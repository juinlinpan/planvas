export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Unknown error';
}

export function readStoredBoolean(key: string, fallbackValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === 'true') {
    return true;
  }

  if (storedValue === 'false') {
    return false;
  }

  return fallbackValue;
}
