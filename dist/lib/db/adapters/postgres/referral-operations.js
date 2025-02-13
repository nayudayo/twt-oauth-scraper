"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresReferralOperations = void 0;
const errors_1 = require("../errors");
class PostgresReferralOperations {
    constructor(pool) {
        this.pool = pool;
    }
    async createReferralCode(code) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO referral_codes (
          code, owner_user_id, usage_count, created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`, [code.code, code.owner_user_id, code.usage_count || 0]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async validateReferralCode(code) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = $1)', [code]);
            return result.rows[0].exists;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async trackReferralUse(tracking) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Insert tracking record
            await client.query(`INSERT INTO referral_tracking (
          referral_code, referrer_user_id, referred_user_id, used_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`, [tracking.referral_code, tracking.referrer_user_id, tracking.referred_user_id]);
            // Increment usage count
            await client.query(`UPDATE referral_codes 
         SET usage_count = usage_count + 1 
         WHERE code = $1`, [tracking.referral_code]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async logReferralUsage(usage) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO referral_usage_log (
          referral_code, used_by_user_id, used_at
        ) VALUES ($1, $2, CURRENT_TIMESTAMP)`, [usage.referral_code, usage.used_by_user_id]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getReferralStats(userId) {
        var _a;
        const client = await this.pool.connect();
        try {
            const [codesResult, usagesResult, totalResult] = await Promise.all([
                client.query('SELECT * FROM referral_codes WHERE owner_user_id = $1', [userId]),
                client.query('SELECT * FROM referral_usage_log WHERE referral_code IN (SELECT code FROM referral_codes WHERE owner_user_id = $1)', [userId]),
                client.query('SELECT SUM(usage_count) as total FROM referral_codes WHERE owner_user_id = $1', [userId])
            ]);
            return {
                codes: codesResult.rows,
                usages: usagesResult.rows,
                totalUses: parseInt(((_a = totalResult.rows[0]) === null || _a === void 0 ? void 0 : _a.total) || '0')
            };
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getReferralHistory(userId) {
        const client = await this.pool.connect();
        try {
            const [referredResult, referredByResult] = await Promise.all([
                client.query('SELECT * FROM referral_tracking WHERE referrer_user_id = $1', [userId]),
                client.query('SELECT * FROM referral_tracking WHERE referred_user_id = $1', [userId])
            ]);
            return {
                referred: referredResult.rows,
                referredBy: referredByResult.rows[0] || null
            };
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async incrementReferralUses(code) {
        const client = await this.pool.connect();
        try {
            await client.query(`UPDATE referral_codes 
         SET usage_count = usage_count + 1 
         WHERE code = $1`, [code]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTopReferrers(limit = 10) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`SELECT 
          owner_user_id as "userId",
          SUM(usage_count) as "totalReferrals"
         FROM referral_codes
         GROUP BY owner_user_id
         ORDER BY "totalReferrals" DESC
         LIMIT $1`, [limit]);
            return result.rows.map(row => ({
                userId: row.userId,
                totalReferrals: parseInt(row.totalReferrals)
            }));
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    isPostgresError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'severity' in error);
    }
}
exports.PostgresReferralOperations = PostgresReferralOperations;
