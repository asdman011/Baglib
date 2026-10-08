const db = require('better-sqlite3')(`C:/Users/Ammar's/AppData/Roaming/baglib/data/baglib.db`);
console.log(db.prepare('SELECT * FROM tag').all());
console.log(db.prepare('SELECT * FROM work_tag').all());
console.log(db.prepare('SELECT w.title, GROUP_CONCAT(DISTINCT t.name) as categories FROM work w LEFT JOIN work_tag wt ON wt.work_id = w.id LEFT JOIN tag t ON t.id = wt.tag_id GROUP BY w.id').all());
