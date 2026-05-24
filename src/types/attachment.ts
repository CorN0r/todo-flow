export interface Attachment {
  id: string;
  task_id: string;
  original_name: string;
  storage_name: string;
  mime_type: string;
  file_size: number;
  thumbnail_name: string | null;
  created_at: string;
}
