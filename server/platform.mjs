import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const pythonExecutable = root => process.env.TTRC_PYTHON || (process.platform === 'win32' ? join(root, 'runtime/python/python.exe') : 'python3');
export const windowsPath = async path => process.platform === 'win32' ? path : (await exec('wslpath', ['-w', path])).stdout.trim();
export const localPath = async path => process.platform === 'win32' ? path : (await exec('wslpath', ['-u', path])).stdout.trim();
export const bundledPlayback = root => {
  const path = join(root, 'Dolphin/playback/Slippi Dolphin.exe');
  return existsSync(path) ? ['--dolphin', path] : [];
};
