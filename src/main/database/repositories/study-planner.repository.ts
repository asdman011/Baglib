import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_TASK_LIST, addCivilDays, civilDate, localDateTime, nextTaskDate, parseCivilDate, parseLocalDateTime, validateTask, validateTaskList, type TaskList, type TaskListInput, type StudyTask, type StudyTaskInput } from '../../../shared/study-planner';

interface TaskRow {
  id: string; title: string; description: string; status: StudyTask['status'];
  start_date: string | null; due_date: string | null; priority: number; sort_order: number;
  list_id: string; recurrence: string | null; reminder_at: string | null; subject: string;
  references_json: string; completed_at: string | null; created_at: string; updated_at: string;
}

function decode(row: TaskRow): StudyTask {
  return { id: row.id, title: row.title, description: row.description, status: row.status,
    startDate: row.start_date, dueDate: row.due_date, priority: row.priority, sortOrder: row.sort_order,
    listId: row.list_id, recurrence: row.recurrence ? JSON.parse(row.recurrence) : null, reminderAt: row.reminder_at, subject: row.subject,
    references: JSON.parse(row.references_json), completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class StudyPlannerRepository {
  constructor(private readonly db: Database.Database) {}

  list(): StudyTask[] {
    return (this.db.prepare('SELECT * FROM study_task ORDER BY sort_order, created_at, id LIMIT 5000').all() as TaskRow[]).map(decode);
  }

  save(raw: StudyTaskInput): StudyTask {
    const input = validateTask(raw);
    return this.db.transaction(() => {
      const previous = input.id ? this.db.prepare('SELECT * FROM study_task WHERE id = ?').get(input.id) as TaskRow | undefined : undefined;
      if (input.id && (!previous || previous.updated_at !== input.expectedUpdatedAt)) throw new Error('planner-conflict');
      const timestamp = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updated_at) + 1 : 0)).toISOString();
      const id = previous?.id || randomUUID();
      const listId = input.listId ?? previous?.list_id ?? DEFAULT_TASK_LIST;
      if (!this.db.prepare('SELECT id FROM task_list WHERE id=?').get(listId)) throw new Error('invalid-request');
      const storedRepeat = input.recurrence === undefined ? previous?.recurrence ? JSON.parse(previous.recurrence) : null : input.recurrence;
      const repeatInput = storedRepeat ? { ...storedRepeat } : null;
      if (repeatInput && previous && (input.dueDate || input.startDate) !== (previous.due_date || previous.start_date)) {
        delete repeatInput.anchorDay;
        delete repeatInput.anchorMonth;
      }
      const recurrence = repeatInput ? JSON.stringify(repeatInput) : null;
      const reminder = input.reminderAt === undefined ? previous?.reminder_at ?? null : input.reminderAt;
      const subject = input.subject ?? previous?.subject ?? '';
      const completed = input.status === 'completed' ? previous?.completed_at || timestamp : null;
      if (previous) {
        this.db.prepare('UPDATE study_task SET title=?, description=?, status=?, start_date=?, due_date=?, priority=?, sort_order=?, references_json=?, completed_at=?, updated_at=?, list_id=?, recurrence=?, reminder_at=?, subject=? WHERE id=?').run(input.title, input.description, input.status, input.startDate, input.dueDate, input.priority, input.sortOrder, JSON.stringify(input.references), completed, timestamp, listId, recurrence, reminder, subject, id);
      } else {
        this.db.prepare('INSERT INTO study_task (id,title,description,status,start_date,due_date,priority,sort_order,references_json,completed_at,created_at,updated_at,list_id,recurrence,reminder_at,subject) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.title, input.description, input.status, input.startDate, input.dueDate, input.priority, input.sortOrder, JSON.stringify(input.references), completed, timestamp, timestamp, listId, recurrence, reminder, subject);
      }
      if (input.status === 'completed' && previous?.status !== 'completed' && recurrence) {
        const repeat = JSON.parse(recurrence);
        const base = input.dueDate || input.startDate || civilDate(new Date());
        const date = parseCivilDate(base);
        repeat.anchorDay ??= date.getDate();
        repeat.anchorMonth ??= date.getMonth();
        const due = nextTaskDate(base, repeat);
        const shift = Math.round((parseCivilDate(due).getTime() - date.getTime()) / 86_400_000);
        let nextReminder: string | null = null;
        if (reminder) {
          const clock = parseLocalDateTime(reminder);
          clock.setDate(clock.getDate() + shift);
          nextReminder = localDateTime(clock);
        }
        // Stable successor identity makes reopen/re-complete and retried completion idempotent.
        this.db.prepare(`INSERT OR IGNORE INTO study_task
          (id,title,description,status,start_date,due_date,priority,sort_order,references_json,completed_at,created_at,updated_at,list_id,recurrence,reminder_at,subject)
          VALUES (?,?,?,'open',?,?,?,?,?,NULL,?,?,?,?,?,?)`).run(
          this.successorId(id), input.title, input.description,
          input.startDate ? civilDate(addCivilDays(parseCivilDate(input.startDate), shift)) : null,
          due, input.priority, input.sortOrder, JSON.stringify(input.references), timestamp, timestamp,
          listId, JSON.stringify(repeat), nextReminder, subject);
      }
      return decode(this.db.prepare('SELECT * FROM study_task WHERE id=?').get(id) as TaskRow);
    })();
  }

  private successorId(id: string): string {
    return `repeat-${createHash('sha256').update(id).digest('hex')}`;
  }

  lists(): TaskList[] {
    return this.db.prepare(`SELECT id,name,icon,group_name AS groupName,sort_order AS sortOrder,
      created_at AS createdAt,updated_at AS updatedAt FROM task_list ORDER BY sort_order,created_at,id`).all() as TaskList[];
  }

  saveList(raw: TaskListInput): TaskList {
    const input = validateTaskList(raw);
    return this.db.transaction(() => {
      const previous = this.lists().find(list => list.id === input.id);
      if (input.id && (!previous || previous.updatedAt !== input.expectedUpdatedAt)) throw new Error('planner-conflict');
      const id = previous?.id ?? randomUUID();
      const timestamp = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
      this.db.prepare(`INSERT INTO task_list (id,name,icon,group_name,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon,group_name=excluded.group_name,sort_order=excluded.sort_order,updated_at=excluded.updated_at`).run(
        id, input.name, input.icon, input.groupName, input.sortOrder, previous?.createdAt ?? timestamp, timestamp);
      return this.lists().find(list => list.id === id)!;
    })();
  }

  removeList(id: string, expected: string): void {
    if (id === DEFAULT_TASK_LIST) throw new Error('invalid-request');
    this.db.transaction(() => {
      const list = this.lists().find(item => item.id === id);
      if (!list || list.updatedAt !== expected) throw new Error('planner-conflict');
      // Move tasks before deletion. Bump revisions so an open editor cannot restore a deleted list.
      const latest = this.db.prepare('SELECT MAX(updated_at) AS revision FROM study_task WHERE list_id=?').get(id) as { revision: string | null };
      const timestamp = new Date(Math.max(Date.now(), latest.revision ? Date.parse(latest.revision) + 1 : 0)).toISOString();
      this.db.prepare('UPDATE study_task SET list_id=?,updated_at=? WHERE list_id=?').run(DEFAULT_TASK_LIST, timestamp, id);
      this.db.prepare('DELETE FROM task_list WHERE id=?').run(id);
    })();
  }

  renameGroup(name: string, nextName: string | null): void {
    if (typeof name !== 'string' || !name || name.length > 100 || nextName !== null && (typeof nextName !== 'string' || !nextName.trim() || nextName.length > 100)) throw new Error('invalid-request');
    this.db.transaction(() => {
      const grouped = this.lists().filter(list => list.groupName === name);
      for (const list of grouped) this.saveList({ ...list, groupName: nextName, expectedUpdatedAt: list.updatedAt });
    })();
  }

  remove(id: string, expected: string): void {
    if (typeof id !== 'string' || id.length > 100 || typeof expected !== 'string') throw new Error('invalid-request');
    if (!this.db.prepare('DELETE FROM study_task WHERE id=? AND updated_at=?').run(id, expected).changes) throw new Error('planner-conflict');
  }
}
