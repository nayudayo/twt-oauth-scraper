"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateError = exports.NotFoundError = exports.ValidationError = exports.SchemaError = exports.TransactionError = exports.QueryError = exports.ConnectionError = exports.DatabaseError = exports.PG_ERROR_CODES = void 0;
// PostgreSQL Error Codes
exports.PG_ERROR_CODES = {
    UNIQUE_VIOLATION: '23505',
    FOREIGN_KEY_VIOLATION: '23503',
    NOT_NULL_VIOLATION: '23502',
    UNDEFINED_TABLE: '42P01',
    UNDEFINED_COLUMN: '42703',
    CONNECTION_FAILURE: '08006',
    INVALID_PASSWORD: '28P01',
    TRANSACTION_ROLLBACK: '40000'
};
// Base Database Error
class DatabaseError extends Error {
    constructor(message, pgError) {
        super(message);
        this.pgError = pgError;
        this.name = 'DatabaseError';
    }
    static fromPgError(error) {
        const code = error.code;
        const detail = error.detail;
        switch (code) {
            case exports.PG_ERROR_CODES.UNIQUE_VIOLATION:
                const match = detail === null || detail === void 0 ? void 0 : detail.match(/Key \((.*?)\)=/);
                const field = match ? match[1] : 'unknown';
                return new DuplicateError(`Duplicate entry for ${field}`, field, error);
            case exports.PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
                return new ValidationError('Foreign key constraint violation', error.constraint || 'unknown', error);
            case exports.PG_ERROR_CODES.NOT_NULL_VIOLATION:
                return new ValidationError('Required field missing', error.column || 'unknown', error);
            case exports.PG_ERROR_CODES.UNDEFINED_TABLE:
                return new SchemaError('Table does not exist', error.table, error);
            case exports.PG_ERROR_CODES.CONNECTION_FAILURE:
            case exports.PG_ERROR_CODES.INVALID_PASSWORD:
                return new ConnectionError('Database connection failed', error);
            case exports.PG_ERROR_CODES.TRANSACTION_ROLLBACK:
                return new TransactionError('Transaction failed to complete', 'ROLLBACK', error);
            default:
                return new DatabaseError(error.message || 'Unknown database error', error);
        }
    }
}
exports.DatabaseError = DatabaseError;
// Connection Errors
class ConnectionError extends DatabaseError {
    constructor(message, pgError) {
        super(message, pgError);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
// Query Errors
class QueryError extends DatabaseError {
    constructor(message, query, params, pgError) {
        super(message, pgError);
        this.query = query;
        this.params = params;
        this.name = 'QueryError';
    }
}
exports.QueryError = QueryError;
// Transaction Errors
class TransactionError extends DatabaseError {
    constructor(message, operation, pgError) {
        super(message, pgError);
        this.operation = operation;
        this.name = 'TransactionError';
    }
}
exports.TransactionError = TransactionError;
// Schema Errors
class SchemaError extends DatabaseError {
    constructor(message, table, pgError) {
        super(message, pgError);
        this.table = table;
        this.name = 'SchemaError';
    }
}
exports.SchemaError = SchemaError;
// Data Validation Errors
class ValidationError extends DatabaseError {
    constructor(message, field, pgError) {
        super(message, pgError);
        this.field = field;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
// Not Found Errors
class NotFoundError extends DatabaseError {
    constructor(message, id, pgError) {
        super(message, pgError);
        this.id = id;
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
// Duplicate Entry Errors
class DuplicateError extends DatabaseError {
    constructor(message, field, pgError) {
        super(message, pgError);
        this.field = field;
        this.name = 'DuplicateError';
    }
}
exports.DuplicateError = DuplicateError;
