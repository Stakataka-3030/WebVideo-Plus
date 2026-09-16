/* Native scheduling keeps ten-minute backups running while the editor tab is in the background. */
function useWebVideoAutomaticBackups(game){
 reactExports.useEffect(()=>{if(!game||!WebVideoCharacterMapEnabled||!__WEBVIDEO_MODULES__.includes('backups'))return;const watchId=crypto.randomUUID();let active=true;
  async function request(action){const d=await(await fetch('/assets/video-export-service.json',{cache:'no-store'})).json(),url=new URL(d.baseUrl);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))return;const response=await fetch(url.origin+'/api/backups/'+action,{method:'POST',headers:{Authorization:'Bearer '+d.token,'Content-Type':'application/json'},body:JSON.stringify({project:game,watchId}),keepalive:action==='unwatch'});if(!response.ok)throw Error('Automatic backup registration failed');}
  async function register(){for(let i=0;i<15&&active;i++){try{await request('watch');if(!active)await request('unwatch');return;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}}
  register();const hide=()=>request('unwatch').catch(()=>{}),show=()=>{if(active)register();};window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{active=false;window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);request('unwatch').catch(()=>{});};
 },[game]);
}
