import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  createPage,
  getPageBoardData,
  importFromProject,
  replacePageBoardState,
  type Page,
  type PageBoardData,
} from '../services/api';
import {
  exportPageAsPng,
  getPagePngExportBoundsFromBoardData,
} from '../utils/export/pagePngExport';
import { exportPageAsPptx } from '../utils/export/pagePptxExport';
import { exportPageAsHtml } from '../utils/export/pageHtmlExport';
import { exportPageAsMarkdown } from '../utils/export/pageMermaidExport';
import { parseMermaidToBoardData } from '../utils/export/mermaidImport';
import type { ExportImageOptions } from '../components/dialogs/ExportImageModal';

export interface UsePageImportExportParams {
  selectedProjectId: string | null;
  selectedPage: Page | null;
  setPages: Dispatch<SetStateAction<Page[]>>;
  setSelectedPageId: (id: string | null) => void;
  isMutating: boolean;
  runMutation: (fn: () => Promise<void>) => Promise<void>;
  refreshProjectNotes: (projectId: string) => Promise<void>;
}

export interface UsePageImportExportResult {
  exportImageDialogData: {
    naturalWidth: number;
    naturalHeight: number;
    pageName: string;
    boardData: PageBoardData;
  } | null;
  setExportImageDialogData: Dispatch<
    SetStateAction<{
      naturalWidth: number;
      naturalHeight: number;
      pageName: string;
      boardData: PageBoardData;
    } | null>
  >;
  mermaidImportDialogOpen: boolean;
  setMermaidImportDialogOpen: (open: boolean) => void;
  crossProjectImportOpen: boolean;
  setCrossProjectImportOpen: (open: boolean) => void;
  handleExportPageClick: (format: 'png' | 'pptx' | 'mermaid' | 'html') => void;
  handleExportImageConfirm: (options: ExportImageOptions) => void;
  handleImportPageButtonClick: (format: 'mermaid') => void;
  handleCrossProjectImportOpen: () => void;
  handleCrossProjectImportConfirm: (
    pageIds: string[],
    noteFiles: string[],
    sourceProjectId: string,
  ) => Promise<void>;
  handleMermaidImportConfirm: (title: string, code: string) => Promise<void>;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

function sanitizeExportName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'page';
}

async function saveFileWithPicker({
  data,
  suggestedName,
  description,
  accept,
}: {
  data: Blob | string;
  suggestedName: string;
  description: string;
  accept: Record<string, string[]>;
}): Promise<void> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (pickerWindow.showSaveFilePicker === undefined) {
    throw new Error(
      '目前瀏覽器不支援「選擇儲存位置」匯出，請改用支援 File System Access API 的瀏覽器。',
    );
  }

  let fileHandle: Awaited<
    ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>
  >;
  try {
    fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description,
          accept,
        },
      ],
    });
  } catch (error) {
    if (isUserCancelledFilePickerError(error)) {
      return;
    }

    throw error;
  }

  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isUserCancelledFilePickerError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();
    return (
      normalizedMessage.includes('user aborted') ||
      normalizedMessage.includes('aborted a request')
    );
  }

  return false;
}

export function usePageImportExport({
  selectedProjectId,
  selectedPage,
  setPages,
  setSelectedPageId,
  isMutating,
  runMutation,
  refreshProjectNotes,
}: UsePageImportExportParams): UsePageImportExportResult {
  const [exportImageDialogData, setExportImageDialogData] = useState<{
    naturalWidth: number;
    naturalHeight: number;
    pageName: string;
    boardData: PageBoardData;
  } | null>(null);
  const [mermaidImportDialogOpen, setMermaidImportDialogOpen] =
    useState(false);
  const [crossProjectImportOpen, setCrossProjectImportOpen] = useState(false);

  function handleExportPageClick(
    format: 'png' | 'pptx' | 'mermaid' | 'html',
  ): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    void runMutation(async () => {
      try {
        const boardData = await getPageBoardData(selectedPage.id);
        const safePageName = sanitizeExportName(selectedPage.name);
        if (format === 'png') {
          const bounds = getPagePngExportBoundsFromBoardData(boardData);
          if (bounds === null) {
            throw new Error('目前 Page 沒有可匯出的物件。');
          }
          setExportImageDialogData({
            naturalWidth: bounds.width,
            naturalHeight: bounds.height,
            pageName: safePageName,
            boardData,
          });
          return;
        }

        if (format === 'mermaid') {
          const markdown = exportPageAsMarkdown(boardData);
          await saveFileWithPicker({
            data: markdown,
            suggestedName: `${safePageName}.md`,
            description: 'Markdown',
            accept: {
              'text/markdown': ['.md'],
            },
          });
          return;
        }

        if (format === 'html') {
          const htmlBlob = await exportPageAsHtml(boardData);
          await saveFileWithPicker({
            data: htmlBlob,
            suggestedName: `${safePageName}.html`,
            description: 'HTML page',
            accept: { 'text/html': ['.html'] },
          });
          return;
        }

        const pptxBlob = await exportPageAsPptx(boardData);
        await saveFileWithPicker({
          data: pptxBlob,
          suggestedName: `${safePageName}.pptx`,
          description: 'PowerPoint presentation',
          accept: {
            'application/vnd.openxmlformats-officedocument.presentationml.presentation':
              ['.pptx'],
          },
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        throw error;
      }
    });
  }

  function handleExportImageConfirm(options: ExportImageOptions): void {
    if (exportImageDialogData === null) return;
    const { boardData, pageName } = exportImageDialogData;
    setExportImageDialogData(null);
    void runMutation(async () => {
      try {
        const pngBlob = await exportPageAsPng(boardData, {
          scale: options.scale,
        });
        await saveFileWithPicker({
          data: pngBlob,
          suggestedName: `${pageName}.png`,
          description: 'PNG image',
          accept: { 'image/png': ['.png'] },
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        throw error;
      }
    });
  }

  function handleImportPageButtonClick(format: 'mermaid'): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    if (format === 'mermaid') {
      setMermaidImportDialogOpen(true);
    }
  }

  function handleCrossProjectImportOpen(): void {
    if (isMutating) return;
    setCrossProjectImportOpen(true);
  }

  async function handleCrossProjectImportConfirm(
    pageIds: string[],
    noteFiles: string[],
    sourceProjectId: string,
  ): Promise<void> {
    if (selectedProjectId === null) return;
    await runMutation(async () => {
      const result = await importFromProject(
        selectedProjectId,
        sourceProjectId,
        pageIds,
        noteFiles,
      );
      setPages((current) => [...current, ...result.pages]);
      if (result.notes.length > 0) {
        await refreshProjectNotes(selectedProjectId);
      }
      setCrossProjectImportOpen(false);
    });
  }

  async function handleMermaidImportConfirm(
    title: string,
    code: string,
  ): Promise<void> {
    if (selectedProjectId === null) {
      return;
    }

    await runMutation(async () => {
      const page = await createPage(selectedProjectId, title);
      setPages((current) => [...current, page]);

      const parsedData = parseMermaidToBoardData(code);

      const boardState = {
        board_items: parsedData.board_items.map((item) => ({
          ...item,
          page_id: page.id,
        })),
        connector_links: parsedData.connector_links.map((link) => ({
          ...link,
          page_id: page.id,
        })),
      };

      await replacePageBoardState(page.id, boardState);
      setSelectedPageId(page.id);
      setMermaidImportDialogOpen(false);
    });
  }

  return {
    exportImageDialogData,
    setExportImageDialogData,
    mermaidImportDialogOpen,
    setMermaidImportDialogOpen,
    crossProjectImportOpen,
    setCrossProjectImportOpen,
    handleExportPageClick,
    handleExportImageConfirm,
    handleImportPageButtonClick,
    handleCrossProjectImportOpen,
    handleCrossProjectImportConfirm,
    handleMermaidImportConfirm,
  };
}
