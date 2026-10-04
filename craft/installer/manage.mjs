import {install,uninstall,prepareUpdateUnmount,recoverSessionLock} from './transaction.mjs';
const [action,...args]=process.argv.slice(2),options={};
const installArgs=['--package','--dest','--craft','--mode','--host-version'];
const actionArgs={install:installArgs,repair:installArgs,uninstall:['--state'],'recover-session':['--state'],'prepare-update':['--state'],'remount-verified-update':['--state','--evidence']};
// Versioned JSON protocol: exactly one terminal result on stdout; throttled
// progress events on stderr. Consumers must drain both streams concurrently.
const onProgress=event=>console.error(JSON.stringify({schemaVersion:1,type:'progress',action,...event}));
const output=result=>console.log(JSON.stringify({schemaVersion:1,type:'result',action:action||'',...result}));
try{
 if(!Object.hasOwn(actionArgs,action))throw Error('Unknown installer action');const allowed=new Set(actionArgs[action]);
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]]!==undefined)throw Error('Invalid or duplicate installer argument: '+args[i]);options[args[i]]=args[i+1];}
 let result;
 if(action==='install'||action==='repair'){
  for(const key of ['--package','--dest','--craft'])if(!options[key])throw Error('Missing '+key);
  if(options['--mode']&&options['--mode']!=='same-name')throw Error('Only same-name installation is supported; external enhanced launchers are retired');
  result=install({packageRoot:options['--package'],adapterRoot:options['--dest'],craftExe:options['--craft'],mode:options['--mode']||'same-name',hostVersion:options['--host-version']||'',repair:action==='repair',onProgress});
 }else{
  if(!options['--state'])throw Error('Missing --state');
  if(action==='uninstall')result=uninstall(options['--state'],{onProgress});
  else if(action==='recover-session')result=recoverSessionLock(options['--state'],{onProgress});
  else if(action==='prepare-update')result=prepareUpdateUnmount(options['--state'],{onProgress});
  else if(action==='remount-verified-update')throw Error('Automatic remount is disabled until a trusted Windows updater completion receipt is implemented');
 }
 const warning=result.hostChanged===true||result.manualActionRequired===true||!!result.retainedRecovery;
 const status=warning?'warning':result.changed?'completed':'unchanged';
 const message=result.message||(result.retainedRecovery?'Operation completed but changed recovery files were retained for manual review.':result.repaired?'Owned package files were repaired.':result.changed?'Operation completed.':'No changes were needed.');
 output({...result,ok:!warning,status,manualActionRequired:warning,message});if(warning)process.exitCode=2;
}catch(error){output({ok:false,status:'error',changed:null,manualActionRequired:/rollback incomplete|rollback refused/.test(error.message),message:error.message});process.exitCode=1;}
