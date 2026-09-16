/* Shared lookup for navigation, available before opening the batch filter panel. */
const WebVideoFilterLibrary=(()=>{
 let data=null,pending=null;
 function key(effects){const M=window.WebVideoNavigationMetadata,flat={},allowed=new Set(['position','scale','duration','ease']);if(!M)return null;for(const [field,spec]of Object.entries(M.fields)){allowed.add(field);allowed.add(spec.path.split('.')[0]);}
  for(const effect of effects){if(!effect||typeof effect!=='object'||Array.isArray(effect))return null;for(const k of Object.keys(effect))if(!allowed.has(k)&&!['shockwaveFilter','radiusAlphaFilter'].includes(k))return null;for(const vector of ['position','scale'])if(effect[vector]&&Object.keys(effect[vector]).some(k=>!['x','y'].includes(k)))return null;
   for(const [field,spec]of Object.entries(M.fields)){const v=spec.path.split('.').reduce((value,k)=>value?.[k],effect)??effect[field];if(v!==undefined){if(typeof v!=='number'||!Number.isFinite(v))return null;flat[field]=v;}}for(const extra of ['shockwaveFilter','radiusAlphaFilter'])if(effect[extra]!==undefined)flat[extra]=effect[extra];
  }
  return JSON.stringify(Object.fromEntries(Object.keys(flat).sort().map(k=>[k,flat[k]])));
 }
 function changed(){const model=window.WebVideoPlus?.state().model;if(model)window.WebVideoPlus.publish(model.path,model.source,true);}
 const api={accept(value){data={presets:value.presets||[],saved:value.saved||[]};changed();},match(effect,target){const signature=key([effect]);if(signature===null)return null;const library=data||{presets:window.WebVideoNavigationMetadata?.filterPresets||[],saved:[]},type=target==='bg-main'?'background':'figure';for(const entry of [...library.saved].reverse().concat(library.presets)){if(target&&entry.appliesTo&&entry.appliesTo!=='both'&&entry.appliesTo!==type)continue;if(typeof entry.name==='string'&&Array.isArray(entry.effects)&&key(entry.effects)===signature)return entry.name;}return null;},async load(){if(pending)return pending;pending=(async()=>{try{const d=await(await fetch('/assets/video-export-service.json',{cache:'no-store'})).json(),url=new URL(d.baseUrl);if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))return;const response=await fetch(url.origin+'/api/filters',{headers:{Authorization:'Bearer '+d.token},signal:AbortSignal.timeout(5000)});if(response.ok)api.accept(await response.json());}catch{}finally{pending=null;}})();return pending;}};return api;
})();
window.WebVideoFilterLibrary=WebVideoFilterLibrary;
