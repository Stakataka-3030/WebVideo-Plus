/* Owned browser confirmation: beta.2 does not authorize Tauri dialog commands.
 * No native dialog permission or IPC is needed to make an explicit decision.
 */
(function(root){'use strict';
 const key='__WebVideoCraftOfficialConfirmationRegistry';
 if(!Object.prototype.hasOwnProperty.call(root,key))Object.defineProperty(root,key,{value:Object.freeze({version:1,pending:new WeakMap()}),writable:false,configurable:false});
 const descriptor=Object.getOwnPropertyDescriptor(root,key),registry=descriptor?.value;
 const pending=descriptor?.writable===false&&descriptor?.configurable===false&&Object.isFrozen(registry)&&registry?.version===1&&Object.prototype.toString.call(registry.pending)==='[object WeakMap]'?registry.pending:null;
 root.WebVideoCraftConfirmOfficialUpdate=function({version,message}={}){
  const document=root.document;
  if(!pending||!document?.body||typeof document.createElement!=='function'||typeof version!=='string'||!version||typeof message!=='string'||!message)return Promise.reject(Error('官方更新确认界面不可用，请保存并重新打开 Craft'));
  const previous=pending.get(document);
  // Keep the original prompt, but never lend its eventual approval to a
  // second caller, even when the visible text happens to be identical.
  if(previous)return Promise.resolve(false);
  let resolve,reject,dialog,install,settled=false;const stops=[];
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const entry={version,message,promise};pending.set(document,entry);
  const finish=(approved,error)=>{
   if(settled)return;
   const accepted=approved===true&&root.document===document&&pending.get(document)===entry&&dialog?.isConnected===true&&dialog.open===true&&install?.isConnected===true&&dialog.contains(install);
   settled=true;
   for(const stop of stops)stop();
   if(pending.get(document)===entry)pending.delete(document);
   try{if(dialog?.open)dialog.close();}catch{}
   dialog?.remove();
   error?reject(error):resolve(accepted);
  };
  const listen=(target,event,callback,options)=>{target.addEventListener(event,callback,options);stops.push(()=>target.removeEventListener(event,callback,options));};
  try{
   dialog=document.createElement('dialog');
   if(typeof dialog.showModal!=='function'||typeof dialog.close!=='function')throw Error('当前 Craft 页面不支持安全确认对话框，请保存并重新打开 Craft');
   dialog.setAttribute('data-webvideo-craft','official-update-confirmation');
   dialog.setAttribute('aria-labelledby','webvideo-craft-official-confirmation-title');
   dialog.setAttribute('aria-describedby','webvideo-craft-official-confirmation-message');
   dialog.style.cssText='pointer-events:auto;box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:24px;border:1px solid GrayText;border-radius:12px;color-scheme:light dark;background:Canvas;color:CanvasText;font:inherit;box-shadow:0 16px 64px #0006';
   const title=document.createElement('h2');title.setAttribute('id','webvideo-craft-official-confirmation-title');title.textContent='安装 Craft '+version+' 更新？';title.style.cssText='margin:0 0 16px;font-size:20px';
   const explanation=document.createElement('p');explanation.setAttribute('id','webvideo-craft-official-confirmation-message');explanation.textContent=message;explanation.style.cssText='margin:0;line-height:1.65;white-space:pre-wrap';
   const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:12px;margin-top:24px';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.setAttribute('autofocus','');cancel.setAttribute('data-webvideo-craft','official-update-cancel');
   install=document.createElement('button');install.type='button';install.textContent='确认安装更新';install.setAttribute('data-webvideo-craft','official-update-install');
   for(const button of [cancel,install])button.style.cssText='font:inherit;padding:8px 16px;border:1px solid GrayText;border-radius:6px;cursor:pointer;background:ButtonFace;color:ButtonText';
   actions.append(cancel,install);dialog.append(title,explanation,actions);
   // Official Reka modal layers may disable body pointer events and listen
   // for outside pointer/focus/Escape events on document. Keep this owned
   // top-layer dialog's interactions from dismissing those native details.
   for(const event of ['pointerdown','focusin','click'])listen(dialog,event,event=>event.stopPropagation());
   listen(cancel,'click',event=>{event.stopPropagation();finish(false);});
   listen(install,'click',event=>{event.stopPropagation();finish(true);});
   listen(dialog,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}});
   // Window capture runs before document-level modal Escape handlers. Scope
   // it to this open dialog so the host's other keyboard behavior is intact.
   listen(root,'keydown',event=>{
    if(event.key!=='Escape'||dialog.open!==true||dialog.isConnected!==true||(!dialog.contains(event.target)&&!dialog.contains(document.activeElement)))return;
    event.preventDefault();event.stopPropagation();finish(false);
   },{capture:true});
   listen(dialog,'cancel',event=>{event.preventDefault();event.stopPropagation();finish(false);});
   listen(dialog,'close',event=>{event.stopPropagation();finish(false);});
   for(const event of ['pagehide','beforeunload'])listen(root,event,()=>finish(false));
   document.body.appendChild(dialog);dialog.showModal();cancel.focus();
  }catch(error){finish(false,error);}
  return promise;
 };
})(globalThis);
