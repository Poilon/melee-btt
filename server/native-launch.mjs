import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {windowsPath} from './platform.mjs';
const exec=promisify(execFile);
export async function launchNative(root, executable) {
  // Check the actual executable even when Dolphin is open without a game.
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',await windowsPath(join(root,'scripts/launch_native.ps1')),'-Executable',await windowsPath(executable)],{windowsHide:true,timeout:15000});
  return JSON.parse(result.stdout.trim());
}
