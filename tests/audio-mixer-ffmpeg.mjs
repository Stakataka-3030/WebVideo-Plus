// Real Windows CreateProcess + process-guard + FFmpeg regression. Run through
// audio-mixer-native.ps1 after build.ps1. No browser, installation or foreground UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const [run,bin]=process.argv.slice(2),ffmpeg=path.join(bin,'ffmpeg.exe'),probe=path.join(run,'AudioMixerProbe.exe');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../browser/audio.js',import.meta.url),'utf8'),context);
const mix=vm.runInContext('audioMixArguments',context),results=[];
const media=path.join(run,'media');fs.mkdirSync(media);
function command(exe,args,options={}) {
 const r=spawnSync(exe,args,{windowsHide:true,timeout:180000,maxBuffer:64*1024*1024,...options});
 if(r.error)throw r.error;assert.equal(r.status,0,r.stderr?.toString());return r;
}
const ff=(args,options)=>command(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],options).stdout;
function source(name,layout,rate,expression) {
 const file=path.join(media,name);ff(['-f','lavfi','-i',`aevalsrc=${expression}:s=${rate}:c=${layout}:d=1.4`,'-c:a','pcm_f32le',file]);return file;
}
const mono=source('mono.wav','mono',44100,'0.15*sin(2*PI*731*t)'),stereo=source('stereo.wav','stereo',48000,'0.12*sin(2*PI*397*t)|0.08*sin(2*PI*997*t)'),surround=source('surround.wav','5.1',32000,'0.01|0.02|0.03|0.04|0.05|0.06');
const positive=source('positive.wav','stereo',48000,'0.2|0.1'),negative=source('negative.wav','stereo',48000,'-0.19|-0.095');
const opus=path.join(media,'loop-opus.ogg'),vorbis=path.join(media,'loop-vorbis.ogg');
ff(['-i',stereo,'-c:a','libopus',opus]);ff(['-i',stereo,'-ar','44100','-c:a','libvorbis',vorbis]);
const base=(file=stereo)=>({kind:'effect',path:file,atMs:0,endMs:1000,volume:1,loop:false});
function samples(file) {return ff(['-i',file,'-map','0:a:0','-c:a','pcm_f64le','-f','f64le','-']);}
function reference(args,duration,name) {
 const copy=[...args],i=copy.indexOf('-filter_complex'),graph=path.join(run,name+'-reference.filter.txt');fs.writeFileSync(graph,copy[i+1]);copy.splice(i,2,'-/filter_complex',graph);
 // Only input filenames change. Relative names let the ORIGINAL monolithic
 // graph run as a numerical reference without Windows argv overflow.
 for(let n=0;n<copy.length;n++)if(copy[n]==='-i')copy[++n]=path.relative(media,copy[n]);
 const file=path.join(run,name+'-reference.wav');
 ff([...copy,'-t',String(duration),'-c:a','pcm_f64le',file],{cwd:media});
 // FFmpeg 9 can emit non-monotonic amix timestamps for input-side -ss plus
 // stream_loop. Compare the requested physical sample window, also enforcing
 // that the new mixer delivers exactly that duration (never its extra tail).
 return ff(['-i',file,'-t',String(duration),'-c:a','pcm_f64le','-f','f64le','-']);
}
function compare(expected,actual,label,tolerance=2e-5) {
 assert.equal(actual.length,expected.length,label+': sample count and channels');let peak=0,squares=0;
 for(let i=0;i<actual.length;i+=8) {const delta=Math.abs(actual.readDoubleLE(i)-expected.readDoubleLE(i));peak=Math.max(peak,delta);squares+=delta*delta;}
 assert.ok(peak<=tolerance,`${label}: maximum sample error ${peak} > ${tolerance}`);return {maxSampleError:peak,rmsError:Math.sqrt(squares/(actual.length/8)),samples:actual.length/8};
}
function invoke(name,args,duration,{entry='mix',start=0,length=duration,fail=false,blockOutput=false}={}) {
 const dir=path.join(run,name),output=path.join(dir,'output.wav'),request=path.join(run,name+'.json');fs.mkdirSync(dir);
 if(blockOutput)fs.mkdirSync(output);
 fs.writeFileSync(request,JSON.stringify({dir,output,args,duration,entry,start,length}));
 const r=spawnSync(probe,[bin,request],{windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});if(r.error)throw r.error;
 if(fail)assert.notEqual(r.status,0);else assert.equal(r.status,0,r.stderr.toString());
 assert.deepEqual(fs.readdirSync(dir).filter(x=>/^audio-mix-[0-9a-f]/.test(x)),[],name+': scratch cleanup');
 const logs=path.join(dir,'audio-mix-logs'),steps=[];
 if(fs.existsSync(logs))for(const log of fs.readdirSync(logs)){const f=path.join(logs,log,'steps.jsonl');if(fs.existsSync(f))steps.push(...fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)));}
 for(const step of steps)if(step.commandLength!==undefined){assert.ok(step.commandLength<=24000);assert.ok(step.inputs<=32);}
 return {dir,output,steps,error:r.stderr.toString()};
}
function check(name,tracks,duration=1,mutes=[]) {
 const args=mix(tracks,duration,mutes),actual=invoke(name,args,duration),metrics=compare(reference(args,duration,name),samples(actual.output),name);
 results.push({name,...metrics,steps:actual.steps.length,maxCommandLength:Math.max(...actual.steps.map(x=>x.commandLength||0))});console.log('PASS',name,JSON.stringify(results.at(-1)));return actual;
}
check('short-original-graph',[{...base(),fadeMs:70,fadeOutMs:90}]);
check('short-stream-loop-offset',[{...base(),loop:true,sourceOffsetMs:700}]);
check('mono-first-44100',Array.from({length:41},(_,i)=>({...base([mono,stereo,surround][i%3]),atMs:i%4*37,endMs:850,volume:.012*(i%3+1),fadeMs:40,fadeOutMs:90})),1,[{start:200,end:350}]);
check('stereo-first-48000',Array.from({length:41},(_,i)=>({...base([stereo,mono,surround][i%3]),kind:i%2?'voice':'effect',atMs:i%4*17,endMs:900,volume:.015,fadeMs:20})),1,[{start:400,end:530}]);
check('surround-first-32000',Array.from({length:35},(_,i)=>({...base([surround,stereo,mono][i%3]),volume:.03,atMs:45,endMs:930})),1);
check('tagged-and-stream-loops',Array.from({length:40},(_,i)=>({...base(i%2?mono:stereo),kind:i%3?'bgm':'voice',loop:true,loopPoints:i%2?null:{start:.13,end:.43},sourceOffsetMs:700,atMs:i%3*21,endMs:950,volume:.014,fadeMs:60,fadeOutMs:100})),1,[{start:380,end:490}]);
check('44100-master-with-tagged-loops',Array.from({length:40},(_,i)=>({...base(i%2?stereo:mono),kind:i%2?'bgm':'voice',loop:true,loopPoints:i%2?{start:.13,end:.43}:null,sourceOffsetMs:700,atMs:i%3*21,endMs:950,volume:.014,fadeMs:60,fadeOutMs:100})),1,[{start:380,end:490}]);
check('late-tag-pins-all-batches',Array.from({length:40},(_,i)=>({...base(i===39?stereo:mono),kind:i===39?'bgm':'voice',loop:true,loopPoints:i===39?{start:.13,end:.43}:null,atMs:i%3*21,endMs:950,volume:.014,fadeMs:60})),1,[{start:380,end:490}]);
check('opus-vorbis-tagged-loops',Array.from({length:40},(_,i)=>({...base(i%2?opus:vorbis),kind:'bgm',loop:true,loopPoints:{start:.13,end:.43},sourceOffsetMs:700,atMs:i%3*21,endMs:950,volume:.014,fadeMs:60,fadeOutMs:100})),1,[{start:380,end:490}]);
check('global-limiter-after-cancellation',Array.from({length:64},(_,i)=>({...base(i<32?positive:negative),kind:i===63?'video-music':'effect',volume:1})),1);
const unclipped=check('float-stages-without-limiter',Array.from({length:64},(_,i)=>({...base(i<32?positive:negative),volume:1})),1);
assert.ok(samples(unclipped.output).readDoubleLE(100*8)>.3,'submixes exceeding full scale must survive until cancellation');

// Both the path list alone and the old complete argv exceed CreateProcessW.
const prefix="中文 ' & ! ";
const padding=Math.max(0,170-path.join(media,prefix,"v.wav").length);
const longDir=path.join(media,prefix+"x".repeat(padding));fs.mkdirSync(longDir);const longFile=path.join(longDir,'v.wav');fs.copyFileSync(stereo,longFile);
const longArgs=mix(Array.from({length:200},(_,i)=>({...base(longFile),kind:'voice',volume:.005,atMs:i%5*11,endMs:900})),1);
const graphAt=longArgs.indexOf('-filter_complex'),oldLength=longArgs.map(x=>'"'+x+'"').join(' ').length,inputLength=longArgs.slice(0,graphAt).map(x=>'"'+x+'"').join(' ').length;
assert.ok(inputLength>32767,`input arguments measure ${inputLength} UTF-16 units`);const rejected=spawnSync(ffmpeg,longArgs,{windowsHide:true,timeout:30000});assert.ok(rejected.error,'old monolithic command must fail to start on Windows');
const longResult=invoke('200-long-paths',longArgs,1);results.push({name:'200-long-paths',oldLength,inputLength,oldSpawnError:rejected.error.code,...compare(reference(longArgs,1,'long'),samples(longResult.output),'long'),steps:longResult.steps.length,maxCommandLength:Math.max(...longResult.steps.map(x=>x.commandLength||0))});console.log('PASS',JSON.stringify(results.at(-1)));

const windows=Array.from({length:1800},(_,i)=>({start:2000+i*2,end:2001+i*2}));check('filter-over-32k',[{...base(),kind:'voice'}],1,windows);
const recursiveArgs=mix(Array.from({length:1025},()=>({...base(positive),endMs:40,volume:.001})),.04),recursive=invoke('recursive-1025',recursiveArgs,.04);
const smallArgs=mix([{...base(positive),endMs:40,volume:1.025}],.04);results.push({name:'recursive-1025',...compare(reference(smallArgs,.04,'recursive'),samples(recursive.output),'recursive',2e-6),steps:recursive.steps.length});assert.ok(recursive.steps.length>34);console.log('PASS',JSON.stringify(results.at(-1)));

const range=invoke('pure-audio-range',longArgs,1,{entry:'audio',start:.2,length:.5}),rangeInfo=JSON.parse(command(path.join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',range.output]).stdout);
assert.equal(rangeInfo.streams[0].codec_name,'pcm_s16le');assert.equal(Number(rangeInfo.streams[0].sample_rate),48000);assert.equal(Number(rangeInfo.format.duration),.5);
const expectedRange=ff(['-ss','0.2','-i',longResult.output,'-t','0.5','-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);const actualRange=ff(['-i',range.output,'-c:a','pcm_s16le','-f','s16le','-']);assert.deepEqual(actualRange,expectedRange);assert.ok(!fs.existsSync(path.join(range.dir,'webgal-audio-full.wav')),'pure audio full mix cleanup');
results.push({name:'pure-audio-range',duration:.5,codec:'pcm_s16le',samples:actualRange.length/2});
const silent=invoke('pure-audio-silence',null,.25,{entry:'audio'});assert.ok(samples(silent.output).every(x=>x===0));results.push({name:'pure-audio-silence',duration:.25});
const deliveryFailure=invoke('pure-audio-delivery-failure',mix([base()],1),1,{entry:'audio',fail:true,blockOutput:true});
assert.ok(!fs.existsSync(path.join(deliveryFailure.dir,'webgal-audio-full.wav')));assert.ok(!fs.readdirSync(deliveryFailure.dir).some(x=>x.includes('.partial.wav')));results.push({name:'pure-audio-delivery-failure',fullMixAndPartialCleaned:true});

const bad=mix(Array.from({length:40},(_,i)=>({...base(i===39?path.join(media,'missing.wav'):stereo),volume:.01})),1),failed=invoke('failed-second-batch',bad,1,{fail:true});
assert.ok(!fs.existsSync(failed.output));assert.match(failed.error,/诊断日志/);assert.ok(failed.steps.some(x=>x.error));
const failureLogs=fs.readdirSync(path.join(failed.dir,'audio-mix-logs')).flatMap(x=>fs.readdirSync(path.join(failed.dir,'audio-mix-logs',x)));assert.ok(failureLogs.some(x=>x.endsWith('.filter.txt')));assert.ok(failureLogs.some(x=>x.endsWith('.args.json')));results.push({name:'failed-second-batch',scratchCleaned:true,failedOutputRemoved:true,diagnosticsRetained:true});
const invalid=[...mix([base()],1)];invalid[invalid.indexOf('-filter_complex')+1]='[wrong]anull[out]';invoke('invalid-cached-plan',invalid,1,{fail:true});results.push({name:'invalid-cached-plan',rejected:true});

const video=path.join(run,'video-with-long-mix.mp4');ff(['-f','lavfi','-i','color=c=black:s=32x32:r=10:d=1','-i',longResult.output,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-c:a','aac','-t','1',video]);assert.ok(fs.statSync(video).size>1000);results.push({name:'video-aac-mux',output:video});
fs.writeFileSync(path.join(run,'result.json'),JSON.stringify({passed:true,ffmpeg:command(ffmpeg,['-version']).stdout.toString().split('\n')[0],results},null,2));console.log(`PASS ${results.length} real FFmpeg checks`);
