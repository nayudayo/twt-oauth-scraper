import { Pool, PoolClient } from 'pg';
import { DatabaseError } from '../errors';
import os from 'os';

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxUsedConnections: number;
  connectionTimeouts: number;
  lastError?: Error;
  lastErrorTime?: Date;
}

export class PostgresConnectionManager {
  private pool: Pool;
  private metrics: ConnectionMetrics;
  private lastHealthCheck: Date;
  private readonly healthCheckInterval = 30000; // 30 seconds
  private readonly maxConnectionAttempts = 3;
  private readonly retryDelayMs = 1000;

  constructor(
    connectionString: string,
    private readonly config: {
      maxConnections?: number;
      minConnections?: number;
      connectionTimeoutMs?: number;
      idleTimeoutMs?: number;
    } = {}
  ) {
    const poolConfig = this.calculatePoolConfig();
    this.pool = new Pool({
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

  private calculatePoolConfig() {
    // Calculate optimal pool size based on available CPUs and memory
    const cpuCount = os.cpus().length;
    const totalMemoryGB = os.totalmem() / 1024 / 1024 / 1024;
    
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

  private setupPoolEventHandlers() {
    this.pool.on('connect', () => {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
      this.metrics.maxUsedConnections = Math.max(
        this.metrics.maxUsedConnections,
        this.metrics.totalConnections
      );
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

    this.pool.on('error', (err: Error) => {
      this.metrics.lastError = err;
      this.metrics.lastErrorTime = new Date();
      console.error('Unexpected error on idle client', err);
    });
  }

  async getConnection(): Promise<PoolClient> {
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < this.maxConnectionAttempts) {
      try {
        const client = await this.pool.connect();
        
        // Validate connection before returning
        if (await this.validateConnection(client)) {
          return client;
        }
        
        client.release();
        throw new Error('Connection validation failed');
      } catch (error) {
        lastError = error as Error;
        attempts++;
        
        if (attempts < this.maxConnectionAttempts) {
          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelayMs * Math.pow(2, attempts - 1))
          );
        }
      }
    }

    throw new DatabaseError(
      `Failed to acquire connection after ${this.maxConnectionAttempts} attempts`,
      {
        name: 'ConnectionError',
        code: 'CONNECTION_FAILED',
        severity: 'ERROR',
        message: lastError?.message || 'Unknown error'
      }
    );
  }

  private async validateConnection(client: PoolClient): Promise<boolean> {
    try {
      const result = await client.query('SELECT 1');
      return result.rows[0]['?column?'] === 1;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{
    isHealthy: boolean;
    metrics: ConnectionMetrics;
    lastHealthCheck: Date;
  }> {
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
      } catch {
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

  async cleanup(): Promise<void> {
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

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }
} 