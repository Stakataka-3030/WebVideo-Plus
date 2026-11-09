// CI evidence only: never retain target IDs/titles, WebSocket URLs, URL queries,
// environment variables, profiles, or raw native logs.
import crypto from 'node:crypto';

export function safeText(value, limit = 320) {
  return String(value ?? '')
    .replace(/-EncodedCommand\s+\S+/gi, '-EncodedCommand <redacted>')
    .replace(/\bwss?:\/\/[^\s"'<>]+/gi, '<websocket-url>')
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, raw => {
      try { const u = new URL(raw); return u.origin + u.pathname; } catch { return '<invalid-url>'; }
    })
    .replace(/[A-Za-z0-9+/]{120,}={0,2}/g, '<encoded-data>')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .slice(0, limit);
}
function xmlText(value) {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
export function shortStderr(value) {
  const text = String(value || '');
  if (!text.includes('#< CLIXML')) return {text: safeText(text), cliXml: false};
  const errors = [...text.matchAll(/<S\b([^>]*)>([\s\S]*?)<\/S>/g)]
    .filter(match => /\bS="Error"/i.test(match[1])).map(match => xmlText(match[2]));
  return {text: errors.length ? safeText(errors.join('\n')) : '<non-error CLIXML omitted>', cliXml: true, errorRecords: errors.length};
}
export function processFailure(error, {timedOut = null, elapsedMs, timeoutMs} = {}) {
  return {
    name: safeText(error?.name || 'Error', 60),
    code: typeof error?.code === 'number' ? error.code : typeof error?.code === 'string' ? safeText(error.code, 80) : null,
    signal: error?.signal ? safeText(error.signal, 30) : null,
    killed: typeof error?.killed === 'boolean' ? error.killed : null,
    timedOut, ...(Number.isFinite(elapsedMs) ? {elapsedMs} : {}), ...(timeoutMs ? {timeoutMs} : {}),
    stderr: shortStderr(error?.stderr),
  };
}
export function failureSummary(error) {
  if (error?.processFailure) return error.processFailure;
  // execFile's message embeds every argument, including EncodedCommand. Never
  // use that message as the diagnostic for an external-process failure.
  if (error?.cmd || error?.stderr !== undefined || error?.killed !== undefined) return processFailure(error);
  return {name: safeText(error?.name || 'Error', 60), code: error?.code ? safeText(error.code, 80) : null,
    ...(error?.cause?.code ? {causeCode: safeText(error.cause.code, 80)} : {}), message: safeText(error?.message || error)};
}
export function targetSummary(targets) {
  if (!Array.isArray(targets)) throw Error('Target endpoint did not return an array');
  let candidateCount = 0;
  const rows = targets.slice(0, 32).map(target => {
    let address;
    try {
      const u = new URL(target?.url);
      if (target?.type === 'page' && u.origin === 'http://tauri.localhost') candidateCount++;
      address = ['http:', 'https:'].includes(u.protocol) ? {origin: u.origin, path: u.pathname.slice(0, 180)} :
        {origin: u.origin, path: u.protocol === 'about:' ? u.pathname.slice(0, 30) : '<opaque-or-file-path-omitted>'};
    } catch { address = {origin: null, path: '<invalid-url>'}; }
    return {type: safeText(target?.type, 40), ...address};
  });
  // Count every target, even when the diagnostic display is capped.
  for (const target of targets.slice(32)) { try { if (target.type === 'page' && new URL(target.url).origin === 'http://tauri.localhost') candidateCount++; } catch {} }
  return {total: targets.length, candidateCount, omitted: Math.max(0, targets.length - rows.length), targets: rows};
}
export function lifecycleSummary(entries) {
  return entries.filter(e => ['host-starting', 'host-started', 'failed', 'injected', 'reinjection-failed'].includes(e.event)).slice(-12).map(e => ({
    event: e.event, at: safeText(e.at, 40),
    ...(Number.isInteger(e.hostPid) ? {hostPid: e.hostPid} : {}), ...(Number.isInteger(e.port) ? {port: e.port} : {}),
    ...(e.error ? {error: safeText(e.error)} : {}),
    ...(e.event === 'injected' ? {mounted: e.result?.mounted === true, ui: e.result?.ui === true, listener: safeText(e.listener, 50)} : {}),
  }));
}
export function nativeLogSummary(text) {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    const category = /panick?ed|panic|fatal/i.test(line) ? 'panic-or-fatal' :
      /初始化开始|initializ\w* (?:start|begin)/i.test(line) ? 'initialization-start' :
      /初始化完成|initializ\w* (?:complete|finish)/i.test(line) ? 'initialization-complete' :
      /webview|webview2/i.test(line) && /error|fail|错误|失败/i.test(line) ? 'webview-error' :
      /\[(?:ERROR|WARN)\]/.test(line) ? 'native-warning-or-error' : null;
    if (category) result.push({category, codes: [...new Set(line.match(/\b0x[0-9a-f]{4,16}\b/gi) || [])].slice(0, 8),
      digest: crypto.createHash('sha256').update(line).digest('hex')});
  }
  return {events: result.slice(-16), omitted: Math.max(0, result.length - 16), rawLinesRetained: false};
}
