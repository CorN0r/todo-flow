export type NoteStyle = 'glass' | 'paper' | 'minimal';

export interface TaskNote {
  task_id: string;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  always_on_top: boolean;
  style: NoteStyle;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
}
