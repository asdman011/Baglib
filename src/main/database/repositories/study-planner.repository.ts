import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { validateTask, type StudyTask, type StudyTaskInput } from '../../../shared/study-planner';

interface TaskRow {
  id: string; title: string; description: string; status: StudyTask['status'];
  start_date: string | null; due_date: string | null; priority: number; sort_order: number;
  references_json: string; completed_at: string | null; created_at: string; updated_at: string;
}

function decode(row: TaskRow): StudyTask {
  return { id: row.id, title: row.title, description: row.description, status: row.status,
    startDate: row.start_date, dueDate: row.due_date, priority: row.priority, sortOrder: row.sort_order,
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
      const completed = input.status === 'completed' ? previous?.completed_at || timestamp : null;
      if (previous) {
        this.db.prepare('UPDATE study_task SET title=?, description=?, status=?, start_date=?, due_date=?, priority=?, sort_order=?, references_json=?, completed_at=?, updated_at=? WHERE id=?').run(input.title, input.description, input.status, input.startDate, input.dueDate, input.priority, input.sortOrder, JSON.stringify(input.references), completed, timestamp, id);
      } else {
        this.db.prepare('INSERT INTO study_task (id,title,description,status,start_date,due_date,priority,sort_order,references_json,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.title, input.description, input.status, input.startDate, input.dueDate, input.priority, input.sortOrder, JSON.stringify(input.references), completed, timestamp, timestamp);
      }
      return decode(this.db.prepare('SELECT * FROM study_task WHERE id=?').get(id) as TaskRow);
    })();
  }

  remove(id: string, expected: string): void {
    if (typeof id !== 'string' || id.length > 100 || typeof expected !== 'string') throw new Error('invalid-request');
    if (!this.db.prepare('DELETE FROM study_task WHERE id=? AND updated_at=?').run(id, expected).changes) throw new Error('planner-conflict');
  }
}
