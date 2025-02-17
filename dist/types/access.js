"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessCodeError = void 0;
/**
 * Error thrown when there are issues with access codes
 */
class AccessCodeError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'AccessCodeError';
    }
}
exports.AccessCodeError = AccessCodeError;
