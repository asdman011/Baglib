import type { Database } from 'better-sqlite3';
import { WorkRepository } from './repositories/work.repository';

import authorsData from './seed/authors.json';
import categoriesData from './seed/categories.json';
import publishersData from './seed/publishers.json';
import booksData from './seed/books.json';

export class SeedService {
  constructor(private db: Database) {}

  /**
   * Run the seed script to populate realistic default data if the DB is empty.
   */
  public async seedIfEmpty() {
    try {
      // Check if there are any works in the database
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM work').get() as { count: number };
      if (countResult.count > 0) {
        console.log('[baglib/seed] Database already has data. Skipping seed.');
        return;
      }

      console.log('[baglib/seed] Database is empty. Seeding initial data...');
      
      // Seed Authors
      if (authorsData && authorsData.length > 0) {
        const insertAuthor = this.db.prepare('INSERT INTO author (id, name, bio, birth_year, death_year) VALUES (?, ?, ?, ?, ?)');
        this.db.transaction(() => {
          for (const author of authorsData) {
            insertAuthor.run(crypto.randomUUID(), author.name, author.bio || null, author.birthYear || null, author.deathYear || null);
          }
        })();
        console.log(`[baglib/seed] Seeded ${authorsData.length} authors.`);
      }

      // Seed Categories (Tags)
      if (categoriesData && categoriesData.length > 0) {
        const insertTag = this.db.prepare('INSERT INTO tag (id, name, category, origin) VALUES (?, ?, ?, ?)');
        this.db.transaction(() => {
          for (const cat of categoriesData) {
            insertTag.run(crypto.randomUUID(), cat.name, 'subject', 'system');
          }
        })();
        console.log(`[baglib/seed] Seeded ${categoriesData.length} categories.`);
      }

      // Seed Publishers (just simple console log for now, as edition handles publisher string)
      if (publishersData && publishersData.length > 0) {
        console.log(`[baglib/seed] Found ${publishersData.length} publishers for editions.`);
      }

      // Seed Books
      if (booksData && booksData.length > 0) {
        const repo = new WorkRepository(this.db);
        for (const book of booksData) {
          repo.addBook(book as any);
        }
        console.log(`[baglib/seed] Seeded ${booksData.length} works.`);
      }

      console.log('[baglib/seed] Seeding completed successfully.');
    } catch (err) {
      console.error('[baglib/seed] Failed to seed database:', err);
    }
  }
}
