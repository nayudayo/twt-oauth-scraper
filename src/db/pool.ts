import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Create and export the database pool
export const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || '5432')
}) 