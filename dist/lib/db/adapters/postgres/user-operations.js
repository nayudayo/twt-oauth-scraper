"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresUserOperations = void 0;
const errors_1 = require("../errors");
const monitoring_1 = require("../../monitoring");
class PostgresUserOperations {
    constructor(pool, monitoringConfig) {
        this.pool = pool;
        this.monitor = new monitoring_1.DatabaseMonitor(pool, monitoringConfig);
    }
    // Helper method for monitored queries
    async monitoredQuery(query, params) {
        const client = await this.pool.connect();
        try {
            return await this.monitor.monitorQuery(client, query, params);
        }
        finally {
            client.release();
        }
    }
    // Create operations
    async saveUserProfile(username, profile) {
        try {
            const result = await this.monitoredQuery('SELECT id FROM users WHERE username = $1 OR twitter_username = $1', [username]);
            if (result.rows.length > 0) {
                // Update existing user
                await this.monitoredQuery(`UPDATE users 
           SET profile_data = $1, 
               profile_picture_url = $2,
               twitter_username = COALESCE($3, twitter_username),
               last_scraped = CURRENT_TIMESTAMP
           WHERE username = $4 OR twitter_username = $4`, [
                    profile.profile_data,
                    profile.profile_picture_url,
                    profile.twitter_username,
                    username
                ]);
            }
            else {
                // Create new user
                await this.monitoredQuery(`INSERT INTO users (
            id, username, twitter_username, profile_data, profile_picture_url, last_scraped
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`, [
                    profile.id || `user_${Date.now()}`,
                    username,
                    profile.twitter_username || null,
                    profile.profile_data,
                    profile.profile_picture_url
                ]);
            }
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async createUser(user) {
        try {
            const result = await this.monitoredQuery(`INSERT INTO users (
          id, username, twitter_username, profile_data, profile_picture_url, last_scraped, created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`, [
                user.id || `user_${Date.now()}`,
                user.username,
                user.twitter_username || null,
                user.profile_data || {},
                user.profile_picture_url
            ]);
            return result.rows[0];
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    // Read operations
    async getUserById(id) {
        try {
            const result = await this.monitoredQuery('SELECT * FROM users WHERE id = $1', [id]);
            return result.rows[0] || null;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async getUserByUsername(username) {
        try {
            const result = await this.monitoredQuery('SELECT * FROM users WHERE username = $1', [username]);
            return result.rows[0] || null;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async getUserByTwitterUsername(username) {
        try {
            const result = await this.monitoredQuery('SELECT * FROM users WHERE twitter_username = $1', [username]);
            return result.rows[0] || null;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async searchUsers(query) {
        try {
            const result = await this.monitoredQuery(`SELECT * FROM users 
         WHERE username ILIKE $1 
         OR profile_data::text ILIKE $1
         ORDER BY username
         LIMIT 50`, [`%${query}%`]);
            return result.rows;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    // Update operations
    async updateUser(id, data) {
        try {
            const updates = [];
            const values = [];
            let paramCount = 1;
            // Build dynamic update query
            if (data.username) {
                updates.push(`username = $${paramCount}`);
                values.push(data.username);
                paramCount++;
            }
            if (data.profile_data) {
                updates.push(`profile_data = $${paramCount}`);
                values.push(data.profile_data);
                paramCount++;
            }
            if (data.profile_picture_url) {
                updates.push(`profile_picture_url = $${paramCount}`);
                values.push(data.profile_picture_url);
                paramCount++;
            }
            if (data.last_scraped) {
                updates.push(`last_scraped = $${paramCount}`);
                values.push(data.last_scraped);
                paramCount++;
            }
            if (updates.length === 0)
                return;
            values.push(id);
            await this.monitoredQuery(`UPDATE users 
         SET ${updates.join(', ')} 
         WHERE id = $${paramCount}`, values);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async updateUserProfile(id, profileData) {
        try {
            await this.monitoredQuery(`UPDATE users 
         SET profile_data = profile_data || $1::jsonb
         WHERE id = $2`, [profileData, id]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    // Utility operations
    async validateUsername(username) {
        try {
            const result = await this.monitoredQuery('SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)', [username]);
            return !result.rows[0].exists;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    async getUserCount() {
        try {
            const result = await this.monitoredQuery('SELECT COUNT(*) FROM users');
            return parseInt(result.rows[0].count);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
    }
    isPostgresError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'severity' in error);
    }
}
exports.PostgresUserOperations = PostgresUserOperations;
