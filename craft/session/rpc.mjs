import crypto from 'node:crypto';
export class SessionRpc {
  constructor({token=crypto.randomBytes(32).toString('hex'),contextId,bindingName,handlers}) {
    this.token=token;this.contextId=contextId;this.bindingName=bindingName;this.handlers=handlers;
    this.seen=new Set();this.active=0;this.closed=false;
  }
  async dispatch(event) {
    if(this.closed||event.name!==this.bindingName||event.executionContextId!==this.contextId) throw Error('untrusted-context');
    if(typeof event.payload!=='string'||Buffer.byteLength(event.payload)>20*1024*1024) throw Error('payload-limit');
    const r=JSON.parse(event.payload);
    if(typeof r.token!=='string'||r.token.length!==this.token.length||!crypto.timingSafeEqual(Buffer.from(r.token),Buffer.from(this.token))) throw Error('invalid-session');
    if(typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(r.id)||this.seen.has(r.id)) throw Error('duplicate-or-invalid-id');
    if(!Object.hasOwn(this.handlers,r.method)||!r.params||typeof r.params!=='object'||Array.isArray(r.params)) throw Error('unknown-operation');
    if(this.active>=8||this.seen.size>=100000) throw Error('session-limit');
    this.seen.add(r.id);this.active++;
    try{return {id:r.id,ok:true,value:await this.handlers[r.method](r.params)};}
    catch(e){return {id:r.id,ok:false,error:e.message};}
    finally{this.active--;}
  }
  close(){this.closed=true;}
}

export class CdpConnection {
  constructor(socket,{timeout=15000}={}) {this.socket=socket;this.timeout=timeout;this.pending=new Map();this.next=0;this.listeners=new Set();
    socket.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
      else for(const fn of this.listeners)fn(m);
    });
    for(const name of ['close','error'])socket.addEventListener(name,()=>this.rejectPending(Error('CDP connection closed')));
  }
  call(method,params={},sessionId) {if(this.socket.readyState!==1)return Promise.reject(Error('CDP unavailable'));
    const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},this.timeout);
      this.pending.set(id,{resolve,reject,timer});try{this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
  }
  on(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  rejectPending(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  close(){this.rejectPending(Error('session closed'));this.socket.close();}
}
