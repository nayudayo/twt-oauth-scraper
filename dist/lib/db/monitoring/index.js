"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseMonitor = void 0;
class DatabaseMonitor {
    constructor(pool, config = {}) {
        this.pool = pool;
        this.config = config;
        this.queryLog = [];
        this.transactionLog = new Map();
        this.slowQueryThreshold = 1000; // 1 second
        this.maxLogSize = 1000;
        this.metricsInterval = null;
        this.slowQueryThreshold = config.slowQueryThreshold || 1000;
        this.maxLogSize = config.maxLogSize || 1000;
        this.setupMetricsCollection(config.metricsInterval || 60000);
    }
    setupMetricsCollection(interval) {
        this.metricsInterval = setInterval(() => {
            this.collectMetrics();
        }, interval);
    }
    // Query monitoring
    async monitorQuery(client, query, params) {
        const startTime = Date.now();
        try {
            const result = await client.query(query, params);
            const duration = Date.now() - startTime;
            this.logQuery({
                query,
                duration,
                timestamp: new Date(),
                params,
                rows: result.rowCount || undefined
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logQuery({
                query,
                duration,
                timestamp: new Date(),
                params,
                error: error
            });
            throw error;
        }
    }
    logQuery(metrics) {
        this.queryLog.push(metrics);
        if (this.queryLog.length > this.maxLogSize) {
            this.queryLog.shift();
        }
        // Log slow queries
        if (metrics.duration > this.slowQueryThreshold) {
            console.warn('Slow query detected:', {
                query: metrics.query,
                duration: metrics.duration,
                timestamp: metrics.timestamp,
                params: metrics.params
            });
        }
    }
    // Transaction monitoring
    startTransaction(id) {
        this.transactionLog.set(id, {
            id,
            startTime: new Date(),
            operations: 0,
            status: 'active'
        });
    }
    incrementTransactionOperations(id) {
        const transaction = this.transactionLog.get(id);
        if (transaction) {
            transaction.operations++;
        }
    }
    endTransaction(id, status, error) {
        const transaction = this.transactionLog.get(id);
        if (transaction) {
            transaction.endTime = new Date();
            transaction.duration = transaction.endTime.getTime() - transaction.startTime.getTime();
            transaction.status = status;
            transaction.error = error;
            // Log long-running transactions
            if (transaction.duration > 5000) { // 5 seconds
                console.warn('Long-running transaction detected:', {
                    id: transaction.id,
                    duration: transaction.duration,
                    operations: transaction.operations,
                    status: transaction.status
                });
            }
        }
    }
    // Metrics collection
    async collectMetrics() {
        try {
            const metrics = {
                timestamp: new Date(),
                pool: {
                    totalCount: this.pool.totalCount,
                    idleCount: this.pool.idleCount,
                    waitingCount: this.pool.waitingCount
                },
                queries: {
                    total: this.queryLog.length,
                    slow: this.queryLog.filter(q => q.duration > this.slowQueryThreshold).length,
                    errors: this.queryLog.filter(q => q.error).length,
                    averageDuration: this.calculateAverageQueryDuration()
                },
                transactions: {
                    active: Array.from(this.transactionLog.values()).filter(t => t.status === 'active').length,
                    completed: Array.from(this.transactionLog.values()).filter(t => t.endTime).length,
                    errors: Array.from(this.transactionLog.values()).filter(t => t.error).length,
                    averageDuration: this.calculateAverageTransactionDuration()
                }
            };
            // Log metrics (could be sent to monitoring service)
            console.info('Database metrics:', metrics);
        }
        catch (error) {
            console.error('Error collecting database metrics:', error);
        }
    }
    calculateAverageQueryDuration() {
        if (this.queryLog.length === 0)
            return 0;
        const total = this.queryLog.reduce((sum, q) => sum + q.duration, 0);
        return total / this.queryLog.length;
    }
    calculateAverageTransactionDuration() {
        const completedTransactions = Array.from(this.transactionLog.values())
            .filter(t => t.duration);
        if (completedTransactions.length === 0)
            return 0;
        const total = completedTransactions.reduce((sum, t) => sum + (t.duration || 0), 0);
        return total / completedTransactions.length;
    }
    // Cleanup
    stop() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
    }
    getMetrics() {
        return {
            queries: {
                recent: [...this.queryLog],
                stats: {
                    total: this.queryLog.length,
                    slow: this.queryLog.filter(q => q.duration > this.slowQueryThreshold).length,
                    errors: this.queryLog.filter(q => q.error).length,
                    averageDuration: this.calculateAverageQueryDuration()
                }
            },
            transactions: {
                active: Array.from(this.transactionLog.values()).filter(t => t.status === 'active'),
                stats: {
                    total: this.transactionLog.size,
                    active: Array.from(this.transactionLog.values()).filter(t => t.status === 'active').length,
                    completed: Array.from(this.transactionLog.values()).filter(t => t.endTime).length,
                    errors: Array.from(this.transactionLog.values()).filter(t => t.error).length,
                    averageDuration: this.calculateAverageTransactionDuration()
                }
            }
        };
    }
}
exports.DatabaseMonitor = DatabaseMonitor;
