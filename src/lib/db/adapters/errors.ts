// PostgreSQL Error Types
export interface PostgresError {
  name: string;
  code: string;
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
  message?: string;
  severity: string;
  schema?: string;
  routine?: string;
}

// PostgreSQL Error Codes
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
  CONNECTION_FAILURE: '08006',
  INVALID_PASSWORD: '28P01',
  TRANSACTION_ROLLBACK: '40000'
} as const;

// Base Database Error
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly pgError?: PostgresError
  ) {
    super(message);
    this.name = 'DatabaseError';
  }

  static fromPgError(error: PostgresError): DatabaseError {
    const code = error.code;
    const detail = error.detail;

    switch (code) {
      case PG_ERROR_CODES.UNIQUE_VIOLATION:
        const match = detail?.match(/Key \((.*?)\)=/);
        const field = match ? match[1] : 'unknown';
        return new DuplicateError(`Duplicate entry for ${field}`, field, error);

      case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
        return new ValidationError('Foreign key constraint violation', error.constraint || 'unknown', error);

      case PG_ERROR_CODES.NOT_NULL_VIOLATION:
        return new ValidationError('Required field missing', error.column || 'unknown', error);

      case PG_ERROR_CODES.UNDEFINED_TABLE:
        return new SchemaError('Table does not exist', error.table, error);

      case PG_ERROR_CODES.CONNECTION_FAILURE:
      case PG_ERROR_CODES.INVALID_PASSWORD:
        return new ConnectionError('Database connection failed', error);

      case PG_ERROR_CODES.TRANSACTION_ROLLBACK:
        return new TransactionError('Transaction failed to complete', 'ROLLBACK', error);

      default:
        return new DatabaseError(error.message || 'Unknown database error', error);
    }
  }
}

// Connection Errors
export class ConnectionError extends DatabaseError {
  constructor(message: string, pgError?: PostgresError) {
    super(message, pgError);
    this.name = 'ConnectionError';
  }
}

// Query Errors
export class QueryError extends DatabaseError {
  constructor(
    message: string, 
    public readonly query?: string,
    public readonly params?: unknown[],
    pgError?: PostgresError
  ) {
    super(message, pgError);
    this.name = 'QueryError';
  }
}

// Transaction Errors
export class TransactionError extends DatabaseError {
  constructor(
    message: string,
    public readonly operation: 'BEGIN' | 'COMMIT' | 'ROLLBACK',
    pgError?: PostgresError
  ) {
    super(message, pgError);
    this.name = 'TransactionError';
  }
}

// Schema Errors
export class SchemaError extends DatabaseError {
  constructor(message: string, public readonly table?: string, pgError?: PostgresError) {
    super(message, pgError);
    this.name = 'SchemaError';
  }
}

// Data Validation Errors
export class ValidationError extends DatabaseError {
  constructor(
    message: string,
    public readonly field: string,
    pgError?: PostgresError
  ) {
    super(message, pgError);
    this.name = 'ValidationError';
  }
}

// Not Found Errors
export class NotFoundError extends DatabaseError {
  constructor(message: string, public readonly id: string, pgError?: PostgresError) {
    super(message, pgError);
    this.name = 'NotFoundError';
  }
}

// Duplicate Entry Errors
export class DuplicateError extends DatabaseError {
  constructor(message: string, public readonly field: string, pgError?: PostgresError) {
    super(message, pgError);
    this.name = 'DuplicateError';
  }
} 