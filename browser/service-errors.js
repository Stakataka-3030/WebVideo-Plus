// Presentation and validation for the existing local service; no retry or recovery policy.
globalThis.WebVideoServiceErrors=(()=>{
 const discoveryPath='/assets/video-export-service.json';
 const messages={
  discovery_missing:['导出服务尚未就绪','通过安装后的 Terre 启动入口重新打开编辑器，稍后再试。'],
  discovery_unavailable:['暂时无法读取服务连接信息','确认 Terre 已正常启动，再重试连接。'],
  discovery_invalid:['服务连接信息格式无效','重新打开 Terre 以刷新连接信息；若仍出现，请在连接后打开日志文件夹。'],
  service_url_invalid:['导出服务地址无效','重新打开 Terre 以刷新服务地址；若仍出现，请查看日志文件夹中的启动记录。'],
  service_unreachable:['暂时无法连接导出服务','稍后重试；若持续出现，请通过安装后的 Terre 启动入口重新打开编辑器。'],
  service_timeout:['导出服务响应超时','稍后重试这项操作；若持续出现，请打开日志文件夹查看对应记录。'],
  service_access_denied:['服务连接信息已过期或请求被拒绝','重新连接或重新打开 Terre，再重试这项操作。'],
  response_invalid:['导出服务返回了无法读取的内容','重试这项操作；若仍出现，请打开日志文件夹并保留技术详情。'],
  operation_cancelled:['操作已取消','按需重新执行这项操作。']
 };
 const raw=error=>error?.message||String(error);
 function create(code,diagnostic,context={},cause){const error=new Error(messages[code]?.[0]||raw(diagnostic));error.code=code;error.diagnostic=raw(diagnostic);error.context=context;if(cause)error.cause=cause;return error;}
 function validateDiscovery(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.baseUrl!=='string'||typeof value.token!=='string'||!value.token.trim())throw create('discovery_invalid','连接信息必须包含 baseUrl 和非空 token');
  let target;try{target=new URL(value.baseUrl);}catch(error){throw create('service_url_invalid','baseUrl 不是有效 URL：'+value.baseUrl,{},error);}
  if(target.protocol!=='http:'||!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/'||target.search||target.hash||target.username||target.password)throw create('service_url_invalid','baseUrl 必须是本机 HTTP 根地址：'+target.origin+target.pathname);
  return {...value,baseUrl:target.origin};
 }
 async function readDiscovery(request){
  let response;try{response=await request(discoveryPath,{cache:'no-store'});}catch(error){if(error?.code==='service_timeout'||error?.name==='AbortError'||error?.name==='TimeoutError')throw error;throw create('discovery_unavailable',raw(error),{endpoint:discoveryPath},error);}
  if(!response.ok)throw create(response.status===404?'discovery_missing':'discovery_unavailable','读取连接信息失败：HTTP '+response.status,{endpoint:discoveryPath,status:response.status});
  let value;try{value=await response.json();}catch(error){if(error?.name==='AbortError'||error?.name==='TimeoutError')throw error;throw create('discovery_invalid','连接信息 JSON 解析失败：'+raw(error),{endpoint:discoveryPath},error);}
  return validateDiscovery(value);
 }
 function requestError(error,context={}){
  if(error?.code&&messages[error.code])return error;
  if(error?.name==='AbortError')return create('operation_cancelled',raw(error),context,error);
  if(/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw(error)))return create('service_unreachable',raw(error),context,error);
  return error;
 }
 async function readResponse(response,context={}){
  const text=await response.text();let value;
  try{value=JSON.parse(text);}catch(error){throw create('response_invalid','HTTP '+response.status+'\n'+text,context,error);}
  if(!response.ok){const diagnostic=typeof value?.error==='string'?value.error:JSON.stringify(value);throw create([401,403].includes(response.status)?'service_access_denied':'request_failed',diagnostic||'HTTP '+response.status,{...context,status:response.status});}
  return value;
 }
 function describe(error,context={}){
  const code=error?.code||'',known=messages[code],original=error?.diagnostic||raw(error),firstLine=original.split(/\r?\n/)[0],job=context.kind==='job';
  const summary=known?known[0]:job?'导出任务未完成':/[\u3400-\u9fff]/.test(firstLine)&&firstLine.length<=160?firstLine:'本次操作未完成';
  const nextStep=known?known[1]:job?'展开技术详情查看原因；处理后可重试任务，或打开日志文件夹查看完整记录。':'核对本次操作的输入；若仍无法完成，请打开日志文件夹并保留技术详情。';
  const facts={...error?.context,...context},lines=[];
  if(code)lines.push('错误类型：'+code);
  if(facts.endpoint)lines.push('请求：'+facts.endpoint);
  if(facts.status)lines.push('HTTP 状态：'+facts.status);
  if(facts.jobId)lines.push('任务：'+facts.jobId);
  if(facts.phase)lines.push('阶段：'+facts.phase);
  if(facts.logPath)lines.push('记录位置：'+facts.logPath);
  lines.push('原始信息：\n'+original);
  const stack=error?.cause?.stack||error?.stack;if(stack)lines.push('调用信息：\n'+stack);
  return {code,title:job?'导出未完成':'操作未完成',summary,nextStep,technical:lines.join('\n\n')};
 }
 return {create,validateDiscovery,readDiscovery,requestError,readResponse,describe};
})();
