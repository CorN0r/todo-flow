/** 工作区:同一时间只激活一个的独立数据空间(一个数据库 + 附件目录) */
export interface WorkspaceInfo {
  id: string;
  name: string;
  is_active: boolean;
  /** "全部任务"页面标题上的数量:顶层任务,不含已归档和已删除的 */
  task_count: number;
  created_at: string;
  last_activated_at: string | null;
}

/** 备份里的一个任务,以及它是否已存在于当前库 */
export interface BackupTaskPreview {
  id: string;
  title: string;
  parent_task_id: string | null;
  exists_locally: boolean;
  is_completed: boolean;
  due_date: string | null;
  source: string | null;
}

export interface BackupPreview {
  /** 父任务在前、子任务在后 */
  tasks: BackupTaskPreview[];
  /** 备份里是否有未删除的日/周回顾文稿 */
  has_reviews: boolean;
}

export interface RecoverCounts {
  /** 当前库中没有、被新加入的任务数 */
  recovered: number;
  /** 当前库中已有、被备份版本替换的任务数 */
  replaced: number;
  /** 被恢复的日/周回顾文稿数 */
  reviews_restored: number;
}
