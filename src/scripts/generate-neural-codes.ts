import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

import { Command } from 'commander';
import { AccessCodeGenerator } from '@/lib/generators/access-codes';
import { initDB } from '@/lib/db';

const program = new Command();

program
  .name('generate-neural-codes')
  .description('Generate neural access codes for the platform')
  .option('-n, --number <count>', 'Number of codes to generate', '100')
  .option('-e, --export', 'Export generated codes to a file', false)
  .option('-d, --deactivate <batch>', 'Deactivate a specific batch of codes')
  .option('-s, --stats <batch>', 'Get statistics for a specific batch')
  .parse(process.argv);

const options = program.opts();

async function main() {
  try {
    // Initialize database connection
    const db = await initDB();
    const generator = new AccessCodeGenerator(db);

    if (options.deactivate) {
      await generator.deactivateBatch(options.deactivate);
      console.info(`Successfully deactivated batch ${options.deactivate}`);
      return;
    }

    if (options.stats) {
      const stats = await generator.getBatchStats(options.stats);
      console.info('Batch Statistics:', stats);
      return;
    }

    const count = parseInt(options.number);
    if (isNaN(count) || count <= 0) {
      console.error('Invalid number of codes specified');
      process.exit(1);
    }

    if (options.export) {
      await generator.generateAndExport({ batchSize: count });
      console.info(`Successfully generated and exported ${count} codes`);
    } else {
      await generator.generateBatch({ batchSize: count });
      console.info(`Successfully generated ${count} codes`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 