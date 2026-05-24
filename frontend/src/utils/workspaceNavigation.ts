import type { Page } from '../services/api';

type ResolveProjectEntryPageIdArgs = {
  preferredPageId: string | null;
  targetProjectId: string;
  pages: Page[];
};

export function resolveProjectEntryPageId({
  preferredPageId,
  targetProjectId,
  pages,
}: ResolveProjectEntryPageIdArgs): string | null {
  const targetProjectPages = pages.filter(
    (page) => page.project_id === targetProjectId,
  );

  if (
    preferredPageId !== null &&
    targetProjectPages.some((page) => page.id === preferredPageId)
  ) {
    return preferredPageId;
  }

  return null;
}

export function selectFallbackId<T extends { id: string }>(
  items: T[],
  preferredId: string | null,
): string | null {
  if (preferredId !== null && items.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  return items[0]?.id ?? null;
}

export function buildUntitledPageName(pages: Page[]): string {
  const takenNumbers = new Set<number>();

  for (const page of pages) {
    const matched = page.name.trim().match(/^untitled_(\d+)$/i);
    if (matched === null) {
      continue;
    }

    const parsed = Number.parseInt(matched[1], 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      takenNumbers.add(parsed);
    }
  }

  let candidate = 1;
  while (takenNumbers.has(candidate)) {
    candidate += 1;
  }

  return `untitled_${candidate}`;
}


