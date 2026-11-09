import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export async function verifySessionListener(executable,port,hostPid,run=promisify(execFile)) {
 if(!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(hostPid)||hostPid<1)throw Error('监听校验参数无效');
 const {stdout}=await run(executable,['--verify-listener',String(port),String(hostPid)],{timeout:15000,windowsHide:true,maxBuffer:16384});
 let result;try{result=JSON.parse(stdout);}catch{throw Error('原生监听校验未返回完整结果');}
 if(result?.schemaVersion!==1||result.verified!==true||result.source!=='native-listener-table'||result.port!==port||result.hostPid!==hostPid||!Number.isInteger(result.ownerPid)||result.ownerPid<1||!Array.isArray(result.addresses)||!result.addresses.length||new Set(result.addresses).size!==result.addresses.length||result.addresses.some(address=>address!=='127.0.0.1'&&address!=='::1'))throw Error('原生监听校验结果不匹配');
 return result;
}
