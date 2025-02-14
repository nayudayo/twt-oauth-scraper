"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConversationRow = isConversationRow;
exports.isMessageRow = isMessageRow;
exports.conversationRowToModel = conversationRowToModel;
exports.messageRowToModel = messageRowToModel;
exports.isDBError = isDBError;
// Type guards and conversion utilities
function isConversationRow(row) {
    return (typeof row === 'object' &&
        row !== null &&
        'id' in row &&
        'user_id' in row &&
        'title' in row &&
        'created_at' in row &&
        'updated_at' in row &&
        'metadata' in row);
}
function isMessageRow(row) {
    return (typeof row === 'object' &&
        row !== null &&
        'id' in row &&
        'conversation_id' in row &&
        'content' in row &&
        'role' in row &&
        'created_at' in row &&
        'metadata' in row);
}
// Conversion functions
function conversationRowToModel(row) {
    return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata
    };
}
function messageRowToModel(row) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        content: row.content,
        role: row.role,
        createdAt: row.created_at,
        metadata: row.metadata
    };
}
function isDBError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error);
}
