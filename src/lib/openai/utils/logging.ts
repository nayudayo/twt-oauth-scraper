import fs from 'fs';
import path from 'path';

// Ensure output directories exist
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const LOGS_DIR = path.join(OUTPUT_DIR, 'logs');
const RAW_RESPONSES_DIR = path.join(LOGS_DIR, 'raw-responses');

function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirectoryExists(RAW_RESPONSES_DIR);

export function logRawResponse(chunkType: string, response: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${chunkType}.txt`;
    const filepath = path.join(RAW_RESPONSES_DIR, filename);

    // Format the content with metadata
    const content = `Timestamp: ${new Date().toISOString()}
Chunk Type: ${chunkType}
-----------------
${response}
-----------------`;

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`[Logging] Raw response saved to ${filepath}`);
  } catch (error) {
    console.error('[Logging Error] Failed to save raw response:', error);
  }
}

// Function to get all raw responses for a specific chunk type
export function getRawResponses(chunkType: string): string[] {
  try {
    const files = fs.readdirSync(RAW_RESPONSES_DIR);
    return files
      .filter(file => file.includes(`_${chunkType}.txt`))
      .map(file => fs.readFileSync(path.join(RAW_RESPONSES_DIR, file), 'utf8'));
  } catch (error) {
    console.error('[Logging Error] Failed to read raw responses:', error);
    return [];
  }
}

// Function to clear old logs (older than 7 days)
export function clearOldLogs() {
  try {
    const files = fs.readdirSync(RAW_RESPONSES_DIR);
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    files.forEach(file => {
      const filepath = path.join(RAW_RESPONSES_DIR, file);
      const stats = fs.statSync(filepath);
      if (stats.mtimeMs < sevenDaysAgo) {
        fs.unlinkSync(filepath);
        console.log(`[Logging] Removed old log file: ${file}`);
      }
    });
  } catch (error) {
    console.error('[Logging Error] Failed to clear old logs:', error);
  }
}

// Clear old logs on module load
clearOldLogs(); 