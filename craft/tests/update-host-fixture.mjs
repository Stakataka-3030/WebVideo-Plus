// Small deterministic model of the pinned beta.2 store and Pinia 3.0.4 action
// subscription contract. This does not substitute for real Pinia/native tests.
export function createAppUpdateStore({status='idle',availableUpdate}={}) {
 const actions=new Set(),subscriptions=new Set(),options={actions:[],state:[]};
 const values={status,availableUpdate,lastError:undefined,downloadProgress:undefined};
 let patching=false;
 const changed=()=>{if(!patching)for(const fn of [...subscriptions])fn({type:'direct'},values);};
 const store={$id:'app-update'};
 for(const key of Object.keys(values))Object.defineProperty(store,key,{enumerable:true,get:()=>values[key],set:value=>{values[key]=value;changed();}});
 for(const [name,state] of Object.entries({isChecking:'checking',isUpdating:'updating',isDownloaded:'downloaded',isInstalled:'installed',isRestarting:'restarting'}))Object.defineProperty(store,name,{get:()=>values.status===state});
 store.$onAction=(fn,detached)=>{actions.add(fn);options.actions.push(detached);return()=>actions.delete(fn);};
 store.$subscribe=(fn,config)=>{subscriptions.add(fn);options.state.push(config);return()=>subscriptions.delete(fn);};
 store.$patch=value=>{patching=true;try{if(typeof value==='function')value(store);else Object.assign(store,value);}finally{patching=false;}for(const fn of [...subscriptions])fn({type:'patch object'},values);};
 store.$dispose=()=>{actions.clear();subscriptions.clear();};
 store.subscriptionState=()=>({actions:actions.size,state:subscriptions.size,options});
 const action=(name,fn)=>store[name]=function(...args){const after=[],errors=[];for(const listener of [...actions])listener({name,store,args,after:callback=>after.push(callback),onError:callback=>errors.push(callback)});let result;try{result=fn(...args);}catch(error){for(const callback of errors)callback(error);throw error;}for(const callback of after)callback(result);return result;};
 action('setChecking',()=>{store.status='checking';store.lastError=undefined;store.downloadProgress=undefined;});
 action('setUpToDate',()=>{store.status='up-to-date';store.availableUpdate=undefined;store.lastError=undefined;});
 action('setAvailableUpdate',update=>{store.availableUpdate=update;store.status='available';store.lastError=undefined;});
 action('setUpdating',()=>{if(!store.availableUpdate)return;store.status='updating';store.lastError=undefined;store.downloadProgress={downloadedBytes:0};});
 action('updateDownloadProgress',progress=>{store.downloadProgress=progress;});
 action('setDownloaded',()=>{if(!store.availableUpdate)return;store.status='downloaded';store.lastError=undefined;});
 action('setInstalled',()=>{if(!store.availableUpdate)return;store.status='installed';store.lastError=undefined;});
 action('setRestarting',()=>{store.status='restarting';store.lastError=undefined;});
 action('setError',(stage,message,nextStatus='error')=>{store.status=nextStatus;store.lastError={stage,message};});
 return store;
}
