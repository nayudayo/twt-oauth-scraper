"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseFactory = void 0;
const postgres_1 = require("./adapters/postgres");
const errors_1 = require("./adapters/errors");
const os_1 = __importDefault(require("os"));
class DatabaseFactory {
    static async initialize(config) {
        if (this.instance) {
            return this.instance;
        }
        try {
            // Validate configuration
            this.validateConfig(config);
            // Calculate optimal pool size if not provided
            const poolConfig = this.calculatePoolConfig(config);
            // Build connection string if not provided
            const connectionString = config.connectionString || this.buildConnectionString(config);
            // Create PostgreSQL adapter with optimized configuration
            const adapter = new postgres_1.PostgresAdapter(connectionString, Object.assign(Object.assign({}, poolConfig), { monitoring: config.monitoring }));
            // Test connection
            await adapter.connect();
            // Verify schema
            const tablesExist = await adapter.checkTables();
            if (!tablesExist) {
                throw new errors_1.DatabaseError('Required database tables are missing');
            }
            // Start health checks
            this.startHealthChecks(adapter);
            this.instance = adapter;
            return adapter;
        }
        catch (error) {
            if (error instanceof errors_1.DatabaseError) {
                throw error;
            }
            throw new errors_1.DatabaseError('Failed to initialize database', error instanceof Error ? {
                name: 'PostgresError',
                code: 'INIT_ERROR',
                severity: 'ERROR',
                message: error.message
            } : undefined);
        }
    }
    static calculatePoolConfig(config) {
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
            maxConnections: config.maxConnections || calculatedMax,
            minConnections: config.minConnections || Math.max(2, Math.floor(calculatedMax / 4)),
            connectionTimeoutMs: config.connectionTimeoutMs || 10000,
            idleTimeoutMs: config.idleTimeoutMs || 30000
        };
    }
    static startHealthChecks(adapter) {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        this.connectionCheckInterval = setInterval(async () => {
            try {
                const health = await adapter.healthCheck();
                if (!health.isHealthy) {
                    console.error('Database health check failed:', health.details);
                    // Try to reconnect if unhealthy
                    await adapter.connect();
                }
            }
            catch (error) {
                console.error('Error during health check:', error);
            }
        }, this.HEALTH_CHECK_INTERVAL);
    }
    static async getInstance() {
        if (!this.instance) {
            throw new errors_1.DatabaseError('Database not initialized. Call initialize() first.');
        }
        return this.instance;
    }
    static validateConfig(config) {
        if (config.type !== 'postgres') {
            throw new errors_1.DatabaseError('Only PostgreSQL is supported as the primary database');
        }
        if (!config.connectionString) {
            // If no connection string, validate individual components
            if (!config.host)
                throw new errors_1.DatabaseError('Database host is required');
            if (!config.database)
                throw new errors_1.DatabaseError('Database name is required');
            if (!config.user)
                throw new errors_1.DatabaseError('Database user is required');
            if (!config.password)
                throw new errors_1.DatabaseError('Database password is required');
        }
        // Validate connection parameters
        if (config.maxConnections && config.maxConnections < 1) {
            throw new errors_1.DatabaseError('maxConnections must be greater than 0');
        }
        if (config.minConnections && config.minConnections < 0) {
            throw new errors_1.DatabaseError('minConnections must be greater than or equal to 0');
        }
        if (config.minConnections && config.maxConnections &&
            config.minConnections > config.maxConnections) {
            throw new errors_1.DatabaseError('minConnections cannot be greater than maxConnections');
        }
        if (config.connectionTimeoutMs && config.connectionTimeoutMs < 0) {
            throw new errors_1.DatabaseError('connectionTimeoutMs must be greater than or equal to 0');
        }
        if (config.idleTimeoutMs && config.idleTimeoutMs < 0) {
            throw new errors_1.DatabaseError('idleTimeoutMs must be greater than or equal to 0');
        }
    }
    static buildConnectionString(config) {
        const port = config.port || 5432;
        return `postgresql://${config.user}:${config.password}@${config.host}:${port}/${config.database}`;
    }
    static async shutdown() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        if (this.instance) {
            await this.instance.disconnect();
            this.instance = undefined;
        }
    }
}
exports.DatabaseFactory = DatabaseFactory;
DatabaseFactory.connectionCheckInterval = null;
DatabaseFactory.HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
