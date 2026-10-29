use std::sync::Mutex;

use serde::Serialize;

/// 一条待处理的提醒弹窗条目(已到期、尚未被用户在面板上处理)。
#[derive(Debug, Clone, Serialize)]
pub struct PendingAlert {
    pub reminder_id: String,
    pub task_id: String,
    pub title: String,
    pub reminder_time: String,
}

/// 提醒弹窗待处理队列,由轮询线程入队、弹窗命令消费。
/// 到期时不再立即 mark_reminded:用户点"关闭"时才落库,
/// 进程重启后未处理的提醒会在下一轮轮询重新弹出,不会丢失。
#[derive(Default)]
pub struct AlertState {
    queue: Mutex<Vec<PendingAlert>>,
}

impl AlertState {
    /// 入队(按 reminder_id 去重)。返回是否为新插入。
    pub fn push_if_absent(&self, alert: PendingAlert) -> bool {
        let mut queue = self.queue.lock().unwrap();
        if queue.iter().any(|a| a.reminder_id == alert.reminder_id) {
            return false;
        }
        queue.push(alert);
        true
    }

    /// 出队。返回是否移除成功。
    pub fn remove(&self, reminder_id: &str) -> bool {
        let mut queue = self.queue.lock().unwrap();
        let before = queue.len();
        queue.retain(|a| a.reminder_id != reminder_id);
        queue.len() != before
    }

    pub fn snapshot(&self) -> Vec<PendingAlert> {
        self.queue.lock().map(|q| q.clone()).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alert(id: &str) -> PendingAlert {
        PendingAlert {
            reminder_id: id.to_string(),
            task_id: "task-1".to_string(),
            title: "测试".to_string(),
            reminder_time: "2026-10-25 10:00".to_string(),
        }
    }

    #[test]
    fn test_push_dedupes_by_reminder_id() {
        let state = AlertState::default();
        assert!(state.push_if_absent(alert("r1")));
        assert!(!state.push_if_absent(alert("r1")));
        assert_eq!(state.snapshot().len(), 1);
        assert!(state.push_if_absent(alert("r2")));
        assert_eq!(state.snapshot().len(), 2);
    }

    #[test]
    fn test_remove() {
        let state = AlertState::default();
        state.push_if_absent(alert("r1"));
        assert!(state.remove("r1"));
        assert!(!state.remove("r1"));
        assert!(state.snapshot().is_empty());
    }
}
