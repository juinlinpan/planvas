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
  default_style_json: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  path?: string | null;
  storage_kind?: 'project_store' | 'external';
  path_exists?: boolean;
  owner?: string | null;
};

export type StoredProject = Omit<Project, 'updated_at'> & {
  updated_at?: string;
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

export type PageRegulateReport = {
  removed_table_child_refs: number;
  removed_connector_links: number;
  normalized_items: number;
};

export type PageRegulateResult = PageBoardData & {
  report: PageRegulateReport;
};

export type ProjectCreatePayload = {
  name: string;
  theme_color: ProjectThemeColor;
};

export type ProjectUpdatePayload = {
  name?: string;
  theme_color?: ProjectThemeColor;
  default_style_json?: string | null;
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

export type IpAlias = {
  ip: string;
  alias: string;
  updated_at: string;
};

export type IpAliasUpdatePayload = {
  ip: string;
  alias: string;
};

export type IpAliasRegistry = {
  version: 1;
  aliases: IpAlias[];
};

export type PublishTarget = {
  url: string;
};

export type ProjectPublishPayload = {
  publish_url: string;
};

export type ProjectPublishResult = {
  project: Project;
  uploaded_name: string;
  owner: string;
};

export type ProjectPublishSnapshot = {
  project: ProjectMetadata['project'];
  pages: Array<{
    semantic_file: string;
    semantic_xml: string;
    presentation_file: string;
    presentation_xml: string;
  }>;
  notes: Array<{
    file: string;
    content: string;
  }>;
};

export type CloudPublishPayload = {
  snapshot: ProjectPublishSnapshot;
};

export type BoardItemCreatePayload = BoardItemBase;
export type BoardItemUpdatePayload = BoardItemBase;
export type ConnectorLinkCreatePayload = ConnectorLinkBase;
export type ConnectorLinkUpdatePayload = ConnectorLinkBase;

export type ImportFromPayload = {
  source_project_id: string;
  page_ids: string[];
  note_files: string[];
};

export type PageBoardStatePayload = {
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
};

export type ProjectMetadata = {
  project: StoredProject;
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
