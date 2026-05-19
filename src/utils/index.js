// index.js (또는 해당 파일)
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export const runCommand = async (cli) => {
  try {
    const { stdout } = await execPromise(cli);
    return stdout.trim();
  } catch (error) {
    console.error(`[ERROR] Failed to run command - CLI(${cli}) | MSG(${error})`);
    return 'N/A';
  }
};
