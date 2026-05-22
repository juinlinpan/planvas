import type { Page } from './api';

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
