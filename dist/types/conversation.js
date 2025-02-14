"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationError = void 0;
// Error types
class ConversationError extends Error {
    constructor(message, code, status = 500) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'ConversationError';
    }
}
exports.ConversationError = ConversationError;
