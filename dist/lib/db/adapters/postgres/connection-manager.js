"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresConnectionManager = void 0;
const pg_1 = require("pg");
const errors_1 = require("../errors");
const os_1 = __importDefault(require("os"));
class PostgresConnectionManager {
    constructor(connectionString, config = {}) {
        this.config = config;
        this.healthCheckInterval = 30000; // 30 seconds
        this.maxConnectionAttempts = 3;
        this.retryDelayMs = 1000;
        const poolConfig = this.calculatePoolConfig();
        this.pool = new pg_1.Pool({
            connectionString,
            max: poolConfig.maxConnections,
            min: poolConfig.minConnections,
            connectionTimeoutMillis: config.connectionTimeoutMs,
            idleTimeoutMillis: config.idleTimeoutMs,
            allowExitOnIdle: false
        });
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingClients: 0,
            maxUsedConnections: 0,
            connectionTimeouts: 0
        };
        this.lastHealthCheck = new Date();
        this.setupPoolEventHandlers();
    }
    calculatePoolConfig() {
        // Calculate optimal pool size based on available CPUs and memory
        const cpuCount = os_1.default.cpus().length;
        const totalMemoryGB = os_1.default.totalmem() / 1024 / 1024 / 1024;
        // Base calculation on the smaller of:
        // 1. Number of CPU cores * 2 (common formula for I/O bound applications)
        // 2. Available memory / 256MB (assumed memory per connection)
        const maxByMemory = Math.floor(totalMemoryGB * 4); // Assume 256MB per connection
        const maxByCPU = cpuCount * 2;
        const calculatedMax = Math.min(maxByMemory, maxByCPU);
        return {
            // Use calculated values or user-provided config
            maxConnections: this.config.maxConnections || calculatedMax,
            minConnections: this.config.minConnections || Math.max(2, Math.floor(calculatedMax / 4))
        };
    }
    setupPoolEventHandlers() {
        this.pool.on('connect', () => {
            this.metrics.totalConnections++;
            this.metrics.activeConnections++;
            this.metrics.maxUsedConnections = Math.max(this.metrics.maxUsedConnections, this.metrics.totalConnections);
        });
        this.pool.on('acquire', () => {
            this.metrics.activeConnections++;
            this.metrics.idleConnections--;
        });
        this.pool.on('release', () => {
            this.metrics.activeConnections--;
            this.metrics.idleConnections++;
        });
        this.pool.on('remove', () => {
            this.metrics.totalConnections--;
        });
        this.pool.on('error', (err) => {
            this.metrics.lastError = err;
            this.metrics.lastErrorTime = new Date();
            console.error('Unexpected error on idle client', err);
        });
    }
    async getConnection() {
        let attempts = 0;
        let lastError;
        while (attempts < this.maxConnectionAttempts) {
            try {
                const client = await this.pool.connect();
                // Validate connection before returning
                if (await this.validateConnection(client)) {
                    return client;
                }
                client.release();
                throw new Error('Connection validation failed');
            }
            catch (error) {
                lastError = error;
                attempts++;
                if (attempts < this.maxConnectionAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * Math.pow(2, attempts - 1)));
                }
            }
        }
        throw new errors_1.DatabaseError(`Failed to acquire connection after ${this.maxConnectionAttempts} attempts`, {
            name: 'ConnectionError',
            code: 'CONNECTION_FAILED',
            severity: 'ERROR',
            message: (lastError === null || lastError === void 0 ? void 0 : lastError.message) || 'Unknown error'
        });
    }
    async validateConnection(client) {
        try {
            const result = await client.query('SELECT 1');
            return result.rows[0]['?column?'] === 1;
        }
        catch (_a) {
            return false;
        }
    }
    async healthCheck() {
        const now = new Date();
        const timeSinceLastCheck = now.getTime() - this.lastHealthCheck.getTime();
        // Only perform health check if enough time has passed
        if (timeSinceLastCheck >= this.healthCheckInterval) {
            try {
                const client = await this.pool.connect();
                const isValid = await this.validateConnection(client);
                client.release();
                if (!isValid) {
                    throw new Error('Connection validation failed');
                }
                this.lastHealthCheck = now;
            }
            catch (_a) {
                return {
                    isHealthy: false,
                    metrics: this.metrics,
                    lastHealthCheck: this.lastHealthCheck
                };
            }
        }
        return {
            isHealthy: true,
            metrics: this.metrics,
            lastHealthCheck: this.lastHealthCheck
        };
    }
    async cleanup() {
        // Clean up idle connections that have been unused
        const idleClients = this.metrics.idleConnections;
        const minConnections = this.config.minConnections || 2;
        if (idleClients > minConnections) {
            const excessConnections = idleClients - minConnections;
            for (let i = 0; i < excessConnections; i++) {
                const client = await this.pool.connect();
                client.release(true); // true = remove from pool
            }
        }
    }
    getMetrics() {
        return Object.assign({}, this.metrics);
    }
    async end() {
        await this.pool.end();
    }
    getPool() {
        return this.pool;
    }
}
exports.PostgresConnectionManager = PostgresConnectionManager;
