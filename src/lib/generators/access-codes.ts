import { randomBytes, createHash } from 'crypto';
import { ExtendedDB } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { AccessCodeError } from '@/types/access';
import { DBTransaction } from '@/lib/db/adapters/types';
import { PoolClient } from 'pg';

// Extend DBTransaction to include client for database operations
interface TransactionWithClient extends DBTransaction {
  client: PoolClient;
}

interface GeneratorOptions {
  batchSize?: number;
}

interface GenerationMetadata {
  generated_at: string;
  hex_part: string;
  hash_part: string;
  batch_id: string;
}

export class AccessCodeGenerator {
  private readonly PREFIX = 'NEURAL';
  private readonly HEX_LENGTH = 4;
  private readonly HASH_LENGTH = 4;
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly MAX_BATCH_SIZE = 1000;

  constructor(private db: ExtendedDB) {}

  private generateHexPart(): string {
    return randomBytes(this.HEX_LENGTH)
      .toString('hex')
      .toUpperCase()
      .slice(0, this.HEX_LENGTH);
  }

  private generateHashPart(hex: string): string {
    const timestamp = Date.now().toString();
    return createHash('sha256')
      .update(`${hex}-${timestamp}`)
      .digest('hex')
      .toUpperCase()
      .slice(0, this.HASH_LENGTH);
  }

  private generateCode(): string {
    const hex = this.generateHexPart();
    const hash = this.generateHashPart(hex);
    return `${this.PREFIX}-${hex}-${hash}`;
  }

  private async isCodeUnique(code: string, transaction: TransactionWithClient): Promise<boolean> {
    const result = await transaction.client.query(
      'SELECT id FROM access_codes WHERE code = $1',
      [code]
    );
    return result.rows.length === 0;
  }

  private validateBatchSize(size: number): void {
    if (size <= 0) {
      throw new AccessCodeError(
        'Batch size must be greater than 0',
        'INVALID_CODE',
        400
      );
    }
    if (size > this.MAX_BATCH_SIZE) {
      throw new AccessCodeError(
        `Batch size cannot exceed ${this.MAX_BATCH_SIZE}`,
        'INVALID_CODE',
        400
      );
    }
  }

  async generateBatch({
    batchSize = this.DEFAULT_BATCH_SIZE
  }: GeneratorOptions = {}): Promise<string[]> {
    this.validateBatchSize(batchSize);
    const codes: string[] = [];
    const batchId = randomBytes(4).toString('hex').toUpperCase();

    await this.db.transaction(async (transaction) => {
      console.log(`Starting batch generation (ID: ${batchId})`);

      while (codes.length < batchSize) {
        const code = this.generateCode();
        if (await this.isCodeUnique(code, transaction as TransactionWithClient)) {
          const metadata: GenerationMetadata = {
            generated_at: new Date().toISOString(),
            hex_part: code.split('-')[1],
            hash_part: code.split('-')[2],
            batch_id: batchId
          };

          await (transaction as TransactionWithClient).client.query(
            `INSERT INTO access_codes (code, metadata) VALUES ($1, $2)`,
            [code, metadata]
          );
          codes.push(code);

          if (codes.length % 10 === 0) {
            console.log(`Generated ${codes.length}/${batchSize} codes...`);
          }
        }
      }

      console.log(`Successfully generated ${batchSize} neural access codes (Batch: ${batchId})`);
    });

    return codes;
  }

  async generateAndExport({
    batchSize = this.DEFAULT_BATCH_SIZE
  }: GeneratorOptions = {}): Promise<void> {
    const codes = await this.generateBatch({ batchSize });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const exportDir = path.join(process.cwd(), 'exports', 'neural-codes');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const filePath = path.join(exportDir, `neural-codes-${timestamp}.txt`);
    
    const header = [
      '=================================',
      '   NEURAL INTERFACE ACCESS CODES',
      '=================================',
      '',
      'FORMAT: NEURAL-[HEX]-[HASH]',
      'BATCH GENERATED: ' + new Date().toISOString(),
      'TOTAL CODES: ' + codes.length,
      '',
      '---------------------------------',
      ''
    ].join('\n');

    const content = header + codes.join('\n');
    fs.writeFileSync(filePath, content);
    
    console.log(`Neural access codes exported to: ${filePath}`);
  }

  async getBatchStats(batchId: string): Promise<{
    total: number;
    used: number;
    available: number;
  }> {
    return this.db.transaction(async (transaction) => {
      const result = await (transaction as TransactionWithClient).client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as used,
          COUNT(CASE WHEN user_id IS NULL AND is_active = true THEN 1 END) as available
        FROM access_codes
        WHERE metadata->>'batch_id' = $1
      `, [batchId]);
      return {
        total: parseInt(result.rows[0].total) || 0,
        used: parseInt(result.rows[0].used) || 0,
        available: parseInt(result.rows[0].available) || 0
      };
    });
  }

  async deactivateBatch(batchId: string): Promise<number> {
    return this.db.transaction(async (transaction) => {
      const result = await (transaction as TransactionWithClient).client.query(`
        UPDATE access_codes 
        SET is_active = false 
        WHERE metadata->>'batch_id' = $1 
        AND user_id IS NULL
        AND is_active = true
      `, [batchId]);
      return result.rowCount || 0;
    });
  }
} 