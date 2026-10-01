/* Deliberately small deterministic DOM fixture, not a substitute for browser rendering. */
export class Node {
  constructor(tag='div',text='') {Object.assign(this,{tagName:tag.toUpperCase(),_text:text,children:[],parentNode:null,dataset:{},attrs:{},listeners:{},hidden:false,disabled:false,checked:false,open:false,value:'',type:'',title:'',className:'',readOnly:false,files:[],style:{}});this.classList={toggle:(name,value)=>{const classes=new Set(this.className.split(/\s+/).filter(Boolean));const enabled=value===undefined?!classes.has(name):value;enabled?classes.add(name):classes.delete(name);this.className=[...classes].join(' ');return enabled},contains:name=>this.className.split(/\s+/).includes(name)};}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('')}
  set textContent(value){this._text=String(value);for(const n of this.children)n.parentNode=null;this.children=[]}
  get parentElement(){return this.parentNode}
  get firstElementChild(){return this.children[0]||null}
  get lastElementChild(){return this.children.at(-1)||null}
  get nextElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null}
  get isConnected(){return ['BODY','HEAD'].includes(this.tagName)||!!this.parentNode?.isConnected}
  append(...items){for(const n of items){n.remove?.();this.children.push(n);n.parentNode=this;if(this.tagName==='SELECT'&&this.children.length===1)this.value=n.value}}
  appendChild(n){this.append(n);return n}
  replaceChildren(...items){for(const n of this.children)n.parentNode=null;this.children=[];this._text='';this.append(...items)}
  setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v)}
  getAttribute(k){return this.attrs[k]??null}
  removeAttribute(k){delete this.attrs[k]}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
  removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(f=>f!==fn)}
  async emit(k,extra={}){for(const fn of this.listeners[k]||[])await fn({target:this,preventDefault(){},...extra})}
  async click(){if(!this.disabled)await this.emit('click')}
  focus(){this.ownerDocument&&(this.ownerDocument.activeElement=this)}
  contains(node){return node===this||this.children.some(n=>n.contains(node))}
  matches(selector){if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('#'))return this.attrs.id===selector.slice(1);const attr=selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attr)return attr[2]===undefined?this.getAttribute(attr[1])!==null:this.getAttribute(attr[1])===attr[2];return this.tagName===selector.toUpperCase()}
  querySelectorAll(selector){return nodes(this).slice(1).filter(n=>selector.split(',').some(s=>n.matches(s.trim())))}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  getBoundingClientRect(){return{x:0,y:0,left:0,top:0,right:1000,bottom:36,width:1000,height:800}}
  scrollIntoView(){}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null}
}
export function nodes(root){return[root,...root.children.flatMap(nodes)]}
export function makeDocument({editor=true}={}) {
  const body=new Node('body'),head=new Node('head'),app=new Node('div'),header=new Node('header'),headerLeft=new Node('div'),headerActions=new Node('div'),editorRoot=new Node('section'),strip=new Node('div'),toolbar=new Node('div'),mode=new Node('button'),host=new Node('div'),nativeLayout=new Node('div'),editorArea=new Node('div'),commands=new Node('section'),commandBar=new Node('div');
  app.setAttribute('id','app');body.append(app);header.append(headerLeft,headerActions);app.append(header);
  if(editor){app.append(editorRoot);editorRoot.append(strip,host);strip.append(toolbar);toolbar.append(mode);mode.setAttribute('data-tour','mode-switch');host.append(nativeLayout);nativeLayout.append(editorArea,commands);editorArea.setAttribute('data-tour','editor-area');commands.setAttribute('data-tour','command-panel');commands.append(commandBar)}
  const listeners={};const document={body,head,activeElement:mode,createElement:t=>{const node=new Node(t);node.ownerDocument=document;return node},createTextNode:t=>new Node('#text',t),querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s),addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),removeEventListener:(type,fn)=>listeners[type]=(listeners[type]||[]).filter(f=>f!==fn)};
  for(const n of nodes(body))n.ownerDocument=document;
  return{document,body,head,app,header,toolbar,host,editorArea,commands,commandBar};
}
