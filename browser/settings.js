// GUI visibility changes can asynchronously reload saved engine options.
// Pin only the export's two timing controls; leave other engine data intact.
globalThis.__lockExportSettings=options=>{
 globalThis.__exportSettingsLock?.dispose();
 const store=__wgProbe.store;
 const fixed={textSpeed:Number(options.textSpeed),autoSpeed:Number(options.autoSpeed)};
 let applying=false;
 const restore=()=>{
  if(applying)return;
  applying=true;
  try{for(const [key,value]of Object.entries(fixed))if(store.getState().userData.optionData[key]!==value)
   store.dispatch({type:'userData/setOptionData',payload:{key,value}});
  }finally{applying=false;}
 };
 const unsubscribe=store.subscribe(restore);
 globalThis.__exportSettingsLock={values:fixed,dispose:unsubscribe};
 restore();
};
