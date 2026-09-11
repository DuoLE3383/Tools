import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { withSavepoint } from './db.js';

test('withSavepoint tolerates savepoint release failures after transaction commit', async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE demo (id INTEGER)');

  await db.run('BEGIN');
  const result = await withSavepoint(db, 'demo', async () => {
    await db.run('CREATE TABLE demo2 (id INTEGER)');
    await db.run('COMMIT');
    return 'ok';
  });

  assert.equal(result, 'ok');
});
