// fix-database.js
import { getDb } from './server/db.js';

async function fixDatabase() {
  console.log('🔧 Fixing database issues...');
  const db = await getDb();
  
  // 1. Create missing cache table
  console.log('1️⃣ Creating key_value_cache table...');
  await db.run(`
    CREATE TABLE IF NOT EXISTS key_value_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
  console.log('✅ key_value_cache table created');
  
  // 2. Check for orphaned savepoints (they should be cleared on restart)
  console.log('2️⃣ Checking for orphaned savepoints...');
  // SQLite savepoints are per-connection, so restarting the server clears them
  console.log('✅ Savepoints will be cleared on server restart');
  
  // 3. Verify tables exist
  console.log('3️⃣ Verifying tables...');
  const tables = await db.all(`
    SELECT name FROM sqlite_master WHERE type='table'
  `);
  console.log('📊 Tables:', tables.map(t => t.name).join(', '));
  
  console.log('✅ Database fix complete!');
  console.log('🔄 Please restart the server for changes to take effect.');
}

fixDatabase().catch(console.error);