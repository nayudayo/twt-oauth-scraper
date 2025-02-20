"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessCodeDB = void 0;
const access_1 = require("../../types/access");
class AccessCodeDB {
    constructor(db) {
        this.db = db;
    }
    async getCodeById(id) {
        const result = await this.db.query(`SELECT 
        id, code, user_id as "userId", 
        created_at as "createdAt", 
        used_at as "usedAt",
        is_active as "isActive",
        metadata
      FROM access_codes 
      WHERE id = $1`, [id]);
        return result.rows[0] || null;
    }
    async validateCode(code) {
        try {
            const result = await this.db.query('SELECT id FROM access_codes WHERE code = $1 AND user_id IS NULL AND is_active = true', [code]);
            if (result.rows.length === 0) {
                throw new access_1.AccessCodeError('Invalid or already used access code', 'INVALID_CODE', 400);
            }
            return true;
        }
        catch (error) {
            if (error instanceof access_1.AccessCodeError) {
                throw error;
            }
            console.error('Validation error:', error);
            throw new access_1.AccessCodeError('Error validating access code', 'INVALID_CODE', 500);
        }
    }
    async linkCodeToUser(code, userId) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            // Check if user already has a code
            const existingCode = await this.getUserAccessCode(userId);
            if (existingCode) {
                throw new access_1.AccessCodeError('User already has an access code', 'USER_HAS_CODE', 400);
            }
            // Check if code is available
            const isAvailable = await this.isCodeAvailable(code);
            if (!isAvailable) {
                throw new access_1.AccessCodeError('Code is not available for use', 'CODE_USED', 400);
            }
            // Link code to user
            const result = await client.query(`UPDATE access_codes 
         SET user_id = $1, used_at = CURRENT_TIMESTAMP 
         WHERE code = $2 AND user_id IS NULL AND is_active = true
         RETURNING id`, [userId, code]);
            if (result.rowCount === 0) {
                throw new access_1.AccessCodeError('Failed to link code to user', 'CODE_USED', 400);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error instanceof access_1.AccessCodeError) {
                throw error;
            }
            console.error('Link code error:', error);
            throw new access_1.AccessCodeError('Error linking code to user', 'INVALID_CODE', 500);
        }
        finally {
            client.release();
        }
    }
    async isCodeAvailable(code) {
        try {
            const result = await this.db.query('SELECT id FROM access_codes WHERE code = $1 AND user_id IS NULL AND is_active = true', [code]);
            return result.rows.length > 0;
        }
        catch (error) {
            console.error('Code availability check error:', error);
            throw new access_1.AccessCodeError('Error checking code availability', 'INVALID_CODE', 500);
        }
    }
    async getUserAccessCode(userId) {
        try {
            const result = await this.db.query(`SELECT 
          id, code, user_id as "userId", 
          created_at as "createdAt", 
          used_at as "usedAt",
          is_active as "isActive",
          metadata
        FROM access_codes 
        WHERE user_id = $1`, [userId]);
            return result.rows[0] || null;
        }
        catch (error) {
            console.error('Get user access code error:', error);
            throw new access_1.AccessCodeError('Error fetching user access code', 'INVALID_CODE', 500);
        }
    }
    // Additional helper methods for internal use
    async deactivateCode(code) {
        try {
            await this.db.query('UPDATE access_codes SET is_active = false WHERE code = $1', [code]);
        }
        catch (error) {
            console.error('Code deactivation error:', error);
            throw new access_1.AccessCodeError('Error deactivating code', 'INVALID_CODE', 500);
        }
    }
    async getCodeStats() {
        try {
            const result = await this.db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as used,
          COUNT(CASE WHEN user_id IS NULL AND is_active = true THEN 1 END) as available
        FROM access_codes
      `);
            return {
                total: parseInt(result.rows[0].total) || 0,
                used: parseInt(result.rows[0].used) || 0,
                available: parseInt(result.rows[0].available) || 0
            };
        }
        catch (error) {
            console.error('Code stats error:', error);
            throw new access_1.AccessCodeError('Error fetching code statistics', 'INVALID_CODE', 500);
        }
    }
    async getTopReferrers(limit = 50) {
        try {
            const result = await this.db.query(`
        SELECT 
          owner_user_id as "userId",
          SUM(usage_count) as "totalReferrals"
        FROM referral_codes
        GROUP BY owner_user_id
        ORDER BY "totalReferrals" DESC
        LIMIT $1
      `, [limit]);
            return result.rows;
        }
        catch (error) {
            console.error('Error fetching top referrers:', error);
            throw new access_1.AccessCodeError('Failed to fetch top referrers', 'INVALID_CODE', 500);
        }
    }
    async getReferralStats(userId) {
        var _a;
        try {
            // Get user's referral codes
            const codesResult = await this.db.query(`
        SELECT 
          id, code, user_id as "userId", 
          created_at as "createdAt", 
          used_at as "usedAt",
          is_active as "isActive",
          metadata
        FROM access_codes 
        WHERE user_id = $1
      `, [userId]);
            // Get usage history
            const usagesResult = await this.db.query(`
        SELECT referral_code as code, used_at
        FROM referral_usage_log
        WHERE used_by_user_id = $1
        ORDER BY used_at DESC
      `, [userId]);
            // Get total uses from referral_codes table
            const totalResult = await this.db.query(`
        SELECT SUM(usage_count) as total
        FROM referral_codes
        WHERE owner_user_id = $1
      `, [userId]);
            return {
                codes: codesResult.rows,
                usages: usagesResult.rows,
                totalUses: parseInt((_a = totalResult.rows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0
            };
        }
        catch (error) {
            console.error('Error fetching referral stats:', error);
            throw new access_1.AccessCodeError('Failed to fetch referral statistics', 'INVALID_CODE', 500);
        }
    }
}
exports.AccessCodeDB = AccessCodeDB;
