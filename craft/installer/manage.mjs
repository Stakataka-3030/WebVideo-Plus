import {install,uninstall,prepareUpdateUnmount,recoverSessionLock} from './transaction.mjs';
const [action,...args]=process.argv.slice(2),options={};
const allowed=new Set(['--package','--dest','--craft','--mode','--host-version','--state','--evidence']);
try{
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||args[i+1]===undefined||options[args[i]]!==undefined)throw Error('Invalid or duplicate installer argument: '+args[i]);options[args[i]]=args[i+1];}
 let result;
 if(action==='install'){
  for(const key of ['--package','--dest','--craft'])if(!options[key])throw Error('Missing '+key);
  result=install({packageRoot:options['--package'],adapterRoot:options['--dest'],craftExe:options['--craft'],mode:options['--mode']||'external',hostVersion:options['--host-version']||''});
 }else{
  if(!options['--state'])throw Error('Missing --state');
  if(action==='uninstall')result=uninstall(options['--state']);
  else if(action==='recover-session')result=recoverSessionLock(options['--state']);
  else if(action==='prepare-update')result=prepareUpdateUnmount(options['--state']);
  else if(action==='remount-verified-update')throw Error('Automatic remount is disabled until a trusted Windows updater completion receipt is implemented');
  else throw Error('Unknown installer action');
 }
 console.log(JSON.stringify({ok:true,...result}));
}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
