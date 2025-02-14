import { DatabaseAdapter } from './adapters/types';
import { PostgresAdapter } from './adapters/postgres';
import { DatabaseError } from './adapters/errors';
import os from 'os';

export interface DBConfig {
  type: 'postgres';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  maxConnections?: number;
  minConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  monitoring?: {
    slowQueryThreshold?: number;
    maxLogSize?: number;
    metricsInterval?: number;
  };
}

export class DatabaseFactory {
  private static instance: PostgresAdapter;
  private static connectionCheckInterval: NodeJS.Timeout | null = null;
  private static readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  static async initialize(config: DBConfig): Promise<PostgresAdapter> {
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
      const adapter = new PostgresAdapter(connectionString, {
        ...poolConfig,
        monitoring: config.monitoring
      });

      // Test connection
      await adapter.connect();

      // Verify schema
      const tablesExist = await adapter.checkTables();
      if (!tablesExist) {
        throw new DatabaseError('Required database tables are missing');
      }

      // Start health checks
      this.startHealthChecks(adapter);

      this.instance = adapter;
      return adapter;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(
        'Failed to initialize database',
        error instanceof Error ? {
          name: 'PostgresError',
          code: 'INIT_ERROR',
          severity: 'ERROR',
          message: error.message
        } : undefined
      );
    }
  }

  private static calculatePoolConfig(config: DBConfig) {
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
      maxConnections: config.maxConnections || calculatedMax,
      minConnections: config.minConnections || Math.max(2, Math.floor(calculatedMax / 4)),
      connectionTimeoutMs: config.connectionTimeoutMs || 10000,
      idleTimeoutMs: config.idleTimeoutMs || 30000
    };
  }

  private static startHealthChecks(adapter: DatabaseAdapter) {
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
      } catch (error) {
        console.error('Error during health check:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  static async getInstance(): Promise<PostgresAdapter> {
    if (!this.instance) {
      throw new DatabaseError('Database not initialized. Call initialize() first.');
    }
    return this.instance;
  }

  private static validateConfig(config: DBConfig): void {
    if (config.type !== 'postgres') {
      throw new DatabaseError('Only PostgreSQL is supported as the primary database');
    }

    if (!config.connectionString) {
      // If no connection string, validate individual components
      if (!config.host) throw new DatabaseError('Database host is required');
      if (!config.database) throw new DatabaseError('Database name is required');
      if (!config.user) throw new DatabaseError('Database user is required');
      if (!config.password) throw new DatabaseError('Database password is required');
    }

    // Validate connection parameters
    if (config.maxConnections && config.maxConnections < 1) {
      throw new DatabaseError('maxConnections must be greater than 0');
    }
    if (config.minConnections && config.minConnections < 0) {
      throw new DatabaseError('minConnections must be greater than or equal to 0');
    }
    if (config.minConnections && config.maxConnections && 
        config.minConnections > config.maxConnections) {
      throw new DatabaseError('minConnections cannot be greater than maxConnections');
    }
    if (config.connectionTimeoutMs && config.connectionTimeoutMs < 0) {
      throw new DatabaseError('connectionTimeoutMs must be greater than or equal to 0');
    }
    if (config.idleTimeoutMs && config.idleTimeoutMs < 0) {
      throw new DatabaseError('idleTimeoutMs must be greater than or equal to 0');
    }
  }

  private static buildConnectionString(config: DBConfig): string {
    const port = config.port || 5432;
    return `postgresql://${config.user}:${config.password}@${config.host}:${port}/${config.database}`;
  }

  static async shutdown(): Promise<void> {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    if (this.instance) {
      await this.instance.disconnect();
      this.instance = undefined!;
    }
  }
} 