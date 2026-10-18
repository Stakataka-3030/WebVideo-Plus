import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function atomic(file, value) {
  const temporary=file+'.tmp-'+crypto.randomUUID();
  try {
    const fd=fs.openSync(temporary,'wx');
    try { fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary,file);
  } finally {
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
  }
}

export function acquireSessionLease(stateDir,{sessionId,installId,wrapperPid}) {
  const file=path.join(stateDir,'session.lock');
  const temporary=path.join(stateDir,'session-start-'+sessionId+'.json');
  let record={schemaVersion:2,sessionId,installId,pid:process.pid,wrapperPid,phase:'preparing'};
  let owned=false;
  try {
    const fd=fs.openSync(temporary,'wx');
    try { fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.linkSync(temporary,file);
    owned=true;
  } catch(error) {
    if(owned)fs.unlinkSync(file);
    throw error;
  } finally {
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
  }
  const update=fields=>{record={...record,...fields};atomic(file,record);};
  const release=()=>{
    const current=JSON.parse(fs.readFileSync(file,'utf8'));
    if(current.sessionId!==sessionId||current.pid!==process.pid)throw Error('Session ownership changed');
    fs.unlinkSync(file);
  };
  return {
    file,
    markStarting(){update({phase:'host-starting'});},
    markHost(hostPid){update({phase:Number.isSafeInteger(hostPid)?'running':'preparing',hostPid});},
    async prepare(action) {
      try { return await action(); }
      catch(error) {
        if(record.phase==='preparing')release();
        throw error;
      }
    }
  };
}
