import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runMigrations() {
  console.log('Starting database migrations...');
  
  // Initialize PostgreSQL connection
  const pool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT || '5432')
  });

  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure migrations run in order

    // Get already executed migrations
    const { rows: executedMigrations } = await pool.query(
      'SELECT name FROM migrations'
    );
    const executedNames = new Set(executedMigrations.map(row => row.name));

    // Run pending migrations
    const client = await pool.connect();
    try {
      for (const file of migrationFiles) {
        if (executedNames.has(file)) {
          console.log(`Migration ${file} already executed, skipping...`);
          continue;
        }

        console.log(`Running migration: ${file}`);
        
        // Start transaction
        await client.query('BEGIN');
        
        try {
          // Read and execute migration file
          const migrationPath = path.join(migrationsDir, file);
          const sql = await fs.readFile(migrationPath, 'utf8');
          
          await client.query(sql);
          
          // Record migration
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [file]
          );
          
          await client.query('COMMIT');
          console.log(`Successfully executed migration: ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute migrations
runMigrations().catch(error => {
  console.error('Migration script failed:', error);
  process.exit(1);
}); 