export const projectThemeColors = [
  'default',
  'sage',
  'sunset',
  'ocean',
] as const;

export type ProjectThemeColor = (typeof projectThemeColors)[number];

export type Project = {
  id: string;
  name: string;
  theme_color: ProjectThemeColor;
  sort_order: number;
  created_at: string;
  updated_at: string;
  path?: string | null;
  storage_kind?: 'project_store' | 'external';
  path_exists?: boolean;
};

export type Page = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  created_at: string;
  updated_at: string;
};

export type ProjectNote = {
  note_file: string;
  title: string;
  content: string;
  content_format: 'markdown';
  updated_at: string;
};

export type BoardItemBase = {
  page_id: string;
  parent_item_id: string | null;
  category: string;
  type: string;
  title: string | null;
  content: string | null;
  content_format: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  is_collapsed: boolean;
  style_json: string | null;
  data_json: string | null;
};

export type BoardItem = BoardItemBase & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type ConnectorLinkBase = {
  connector_item_id: string;
  from_item_id: string | null;
  to_item_id: string | null;
  from_anchor: string | null;
  to_anchor: string | null;
};

export type ConnectorLink = ConnectorLinkBase & {
  id: string;
};

export type PageBoardData = {
  page: Page;
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
};

export type ProjectCreatePayload = {
  name: string;
  theme_color: ProjectThemeColor;
};

export type ProjectUpdatePayload = {
  name?: string;
  theme_color?: ProjectThemeColor;
};

export type PageCreatePayload = {
  name: string;
};

export type PageUpdatePayload = {
  name: string;
};

export type PageViewportPayload = {
  viewport_x: number;
  viewport_y: number;
  zoom: number;
};

export type OrderedIdsPayload = {
  ordered_ids: string[];
};

export type ProjectOpenPathPayload = {
  path: string;
};

export type BoardItemCreatePayload = BoardItemBase;
export type BoardItemUpdatePayload = BoardItemBase;
export type ConnectorLinkCreatePayload = ConnectorLinkBase;
export type ConnectorLinkUpdatePayload = ConnectorLinkBase;

export type PageBoardStatePayload = {
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
};

export type ProjectMetadata = {
  project: Project;
  pages: Array<Page & { file?: string }>;
};

export type ProjectIndexEntry = {
  project_id: string;
  path: string;
  storage_kind: 'project_store' | 'external';
  sort_order: number;
  added_at: string;
  last_seen_at: string;
};

export type ProjectIndex = {
  version: 1;
  projects: ProjectIndexEntry[];
};
