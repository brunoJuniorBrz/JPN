import { execFile,type ChildProcess } from "node:child_process";

/** Windows venv/uv launchers can own a separate Python process. Terminating
 * only the launcher leaves the numerical worker alive with inherited pipes.
 * Completion is still confirmed by the caller's close event and cleanup gate. */
export function terminateWorker(child:ChildProcess){
  if(process.platform!=="win32"||!child.pid){child.kill();return;}
  execFile("taskkill.exe",["/PID",String(child.pid),"/T","/F"],
    {windowsHide:true,timeout:1000},()=>{child.kill();});
}
