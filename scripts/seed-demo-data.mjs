// Seed demo data into TodoFlow SQLite database for screenshot purposes
// Uses Node 24 built-in node:sqlite
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dbPath = join(homedir(), 'AppData', 'Roaming', 'com.todoflow.desktop', 'todo.db');
console.log(`Seeding database: ${dbPath}`);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

// ===== Helper functions =====
function uid() { return randomUUID(); }
function isoDate(daysFromNow = 0, hour = null, minute = null) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const datePart = d.toISOString().slice(0, 10);
  if (hour !== null) return `${datePart} ${String(hour).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
  return datePart;
}
function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

// ===== Tags =====
const tagIds = {};
const tags = [
  { name: '工作', color: '#3B82F6', icon: 'Briefcase', sort: 0, children: [
    { name: '项目A', color: '#2563EB', icon: 'Folder', sort: 0 },
    { name: '会议', color: '#6366F1', icon: 'Calendar', sort: 1 },
  ]},
  { name: '个人', color: '#10B981', icon: 'User', sort: 1, children: [] },
  { name: '学习', color: '#F59E0B', icon: 'Book', sort: 2, children: [] },
  { name: '健康', color: '#EF4444', icon: 'Heart', sort: 3, children: [] },
];

function createTag(name, color, icon, sort, parentId) {
  const id = uid();
  db.prepare('INSERT INTO tags (id, name, color, icon, sort_order, parent_tag_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, color, icon, sort, parentId || null);
  tagIds[name] = id;
  return id;
}

for (const tag of tags) {
  const parentId = createTag(tag.name, tag.color, tag.icon, tag.sort, null);
  for (const child of (tag.children || [])) {
    createTag(child.name, child.color, child.icon, child.sort, parentId);
  }
}
console.log(`Created ${Object.keys(tagIds).length} tags`);

// ===== Tasks =====
const taskDefs = [
  // Today's tasks (my_day)
  { title: '完成季度报告', desc: '汇总Q2数据并撰写分析报告，需包含图表和趋势分析', priority: 3, due: isoDate(0, 17, 0), tag: '工作', myday: true, pinned: true },
  { title: '团队周会', desc: '讨论本周进度和下周计划，准备演示文稿', priority: 2, due: isoDate(0, 14, 0), tag: '会议', myday: true },
  { title: '审核产品原型', desc: '检查新功能的交互设计和视觉稿', priority: 2, due: isoDate(0, 16, 30), tag: '项目A', myday: true },
  { title: '阅读《系统设计》第三章', desc: '分布式系统章节，做读书笔记', priority: 1, due: null, tag: '学习', myday: true },
  { title: '晨跑30分钟', desc: '保持每周至少3次有氧运动', priority: 1, due: isoDate(0, 7, 0), tag: '健康', myday: true },

  // Tomorrow
  { title: '修复登录页Bug', desc: '用户反馈登录时偶发500错误，需排查后端日志', priority: 3, due: isoDate(1, 14, 0), tag: '项目A', myday: false },
  { title: '准备客户提案', desc: '新客户需求分析和技术方案设计', priority: 2, due: isoDate(1, 10, 0), tag: '工作', myday: false },

  // This week
  { title: '重构数据库查询层', desc: '优化慢查询，添加索引，迁移旧API到新架构', priority: 2, due: isoDate(3, 0, 0), tag: '项目A', myday: false },
  { title: '代码审查：支付模块', desc: 'Review team PR #234, #237 关于支付流程的改动', priority: 2, due: isoDate(2, 15, 0), tag: '项目A', myday: false },
  { title: '更新技术文档', desc: '补充API文档和部署指南，迁移到新文档平台', priority: 1, due: isoDate(5, 0, 0), tag: '工作', myday: false },

  // Later
  { title: '学习Rust异步编程', desc: '深入理解 Future、async/await 和 tokio 运行时', priority: 1, due: isoDate(7, 0, 0), tag: '学习', myday: false },
  { title: '设计新功能架构', desc: '规划下个版本的用户权限系统和多租户方案', priority: 2, due: isoDate(10, 0, 0), tag: '工作', myday: false },
  { title: '整理读书笔记', desc: '将最近3个月的读书笔记整理成知识图谱', priority: 1, due: null, tag: '个人', myday: false },

  // Completed
  { title: '完成UI组件库选型', desc: '对比评估了Radix、Ark、Headless方案', priority: 2, due: isoDate(-1, 0, 0), tag: '项目A', completed: true },
  { title: '修复导航栏样式问题', desc: '移动端适配和深色模式兼容', priority: 1, due: isoDate(-2, 0, 0), tag: '工作', completed: true },
  { title: '购买下周会议用品', desc: '白板笔、便利贴、打印资料', priority: 0, due: isoDate(-1, 0, 0), tag: '个人', completed: true },
  { title: '健身房年卡续费', desc: '续费到明年6月底', priority: 1, due: isoDate(-3, 0, 0), tag: '健康', completed: true },
];

const taskIds = [];
for (const t of taskDefs) {
  const id = uid();
  db.prepare(`INSERT INTO tasks (id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned, priority, due_date, tag_id, parent_task_id, sort_order, recurrence, my_day_date, reminded, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, NULL, 0, NULL, ?, 0, ?, ?)`)
    .run(id, t.title, t.desc, t.completed ? 1 : 0, t.pinned ? 1 : 0, t.priority, t.due, tagIds[t.tag] || null, t.myday ? isoDate(0) : null, now(), now());
  taskIds.push(id);

  // Add reminder for due tasks with time
  if (t.due && t.due.includes(' ') && !t.completed) {
    const remId = uid();
    db.prepare('INSERT INTO task_reminders (id, task_id, offset, reminder_time, reminded, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .run(remId, id, '-30m', t.due.replace(/(\d{2}):(\d{2})$/, (_, h, m) => {
        const totalMin = parseInt(h) * 60 + parseInt(m) - 30;
        const nh = Math.floor((totalMin + 1440) % 1440 / 60);
        const nm = (totalMin + 1440) % 60;
        return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      }), now());
  }
}
console.log(`Created ${taskDefs.length} tasks`);

// ===== Subtasks for "完成季度报告" =====
const parentTaskId = taskIds[0]; // 完成季度报告
const subtaskDefs = [
  { title: '收集各部门Q2数据', completed: true },
  { title: '数据清洗与汇总', completed: false },
  { title: '制作图表和可视化', completed: false },
  { title: '撰写分析报告正文', completed: false },
  { title: '提交给主管审核', completed: false },
];

db.prepare('SELECT MAX(sort_order) as max_sort FROM tasks WHERE parent_task_id = ?').all(parentTaskId);
let sortOrder = 1;
for (const st of subtaskDefs) {
  const id = uid();
  db.prepare(`INSERT INTO tasks (id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned, priority, due_date, tag_id, parent_task_id, sort_order, recurrence, my_day_date, reminded, created_at, updated_at)
    VALUES (?, ?, '', ?, 0, 0, 0, 0, 0, NULL, NULL, ?, ?, NULL, NULL, 0, ?, ?)`)
    .run(id, st.title, st.completed ? 1 : 0, parentTaskId, sortOrder++, now(), now());
}
console.log(`Created ${subtaskDefs.length} subtasks`);

// ===== Habits =====
const habitDefs = [
  { name: '早起打卡', color: '#F59E0B', icon: 'Sun', frequency: 'daily', target: 1, sort: 0 },
  { name: '阅读30分钟', color: '#8B5CF6', icon: 'BookOpen', frequency: 'daily', target: 1, sort: 1 },
  { name: '运动锻炼', color: '#10B981', icon: 'Dumbbell', frequency: 'weekly', target: 3, sort: 2 },
  { name: '喝水8杯', color: '#3B82F6', icon: 'Droplets', frequency: 'daily', target: 8, sort: 3 },
];

const habitIds = [];
for (const h of habitDefs) {
  const id = uid();
  db.prepare('INSERT INTO habits (id, name, color, icon, frequency, target_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, h.name, h.color, h.icon, h.frequency, h.target, h.sort);
  habitIds.push(id);
}
console.log(`Created ${habitDefs.length} habits`);

// ===== Habit logs (last 7 days) =====
for (let day = 6; day >= 0; day--) {
  const date = isoDate(-day);
  habitIds.forEach((hid, idx) => {
    if (idx === 0) {
      const count = day <= 2 ? 1 : (Math.random() > 0.3 ? 1 : 0); // 早起 - more consistent recently
      if (count > 0) {
        db.prepare('INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note) VALUES (?, ?, ?, ?, ?)')
          .run(uid(), hid, date, count, count > 0 ? '' : '');
      }
    } else if (idx === 1) {
      const count = Math.random() > 0.4 ? 1 : 0; // reading
      if (count > 0) {
        db.prepare('INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note) VALUES (?, ?, ?, ?, ?)')
          .run(uid(), hid, date, count, '读了一章');
      }
    } else if (idx === 2) {
      if (day % 2 === 0) { // every other day
        db.prepare('INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note) VALUES (?, ?, ?, ?, ?)')
          .run(uid(), hid, date, 1, '跑步30分钟');
      }
    } else if (idx === 3) {
      const count = Math.floor(Math.random() * 3) + 5; // 5-7 cups
      db.prepare('INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note) VALUES (?, ?, ?, ?, ?)')
        .run(uid(), hid, date, count, '');
    }
  });
}
console.log('Created habit logs for the past week');

db.close();
console.log('\n✅ Demo data seeded successfully!');
console.log(`Database: ${dbPath}`);
