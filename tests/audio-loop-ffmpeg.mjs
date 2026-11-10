// Offline numerical regression check: node tests/audio-loop-ffmpeg.mjs
// Requires FFmpeg with libopus and libvorbis; optionally set FFMPEG_PATH.
// Deliberately separate from *.test.mjs so the regular Node suite needs no FFmpeg.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../browser/audio.js',import.meta.url),'utf8'),context);
const mix=vm.runInContext('audioMixArguments',context);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-audio-loop-'));
function ffmpeg(args){
 const result=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error',...args],{
  windowsHide:true,timeout:30000,maxBuffer:16*1024*1024
 });
 if(result.error)throw result.error;
 assert.equal(result.status,0,result.stderr.toString());
 return result.stdout;
}
function render(args,{legacy=false,pad=true}={}){
 const result=[...args],index=result.indexOf('-filter_complex')+1;
 if(legacy)result[index]=result[index].replace(/(aloop=[^,]+),asetpts=N\/SR\/TB,atrim=/,'$1,atrim=');
 if(!pad)result[index]=result[index].replace(',apad,',',');
 return ffmpeg([...result,'-ac','1','-c:a','pcm_f32le','-f','f32le','-']);
}
function rmsTail(buffer){
 const samples=240; // Last 5 ms: enough periods of the 1 kHz fixture.
 let squares=0;
 for(let i=buffer.length-samples*4;i<buffer.length;i+=4)squares+=buffer.readFloatLE(i)**2;
 return Math.sqrt(squares/samples);
}
try{
 for(const [codec,extension,rate] of [['pcm_s16le','wav',48000],['libopus','ogg',48000],['libvorbis','ogg',48000],['libvorbis','ogg',44100]]){
  const file=path.join(directory,`${codec}-${rate}.${extension}`);
  ffmpeg(['-f','lavfi','-i',`sine=frequency=1000:sample_rate=${rate}:duration=0.6`,'-c:a',codec,file]);
  for(const sourceOffsetMs of [0,700]){
   const label=`${codec}/${rate}, offset ${sourceOffsetMs} ms`;
   const args=mix([{kind:'bgm',loop:true,loopPoints:{start:.13,end:.43},path:file,atMs:0,endMs:null,volume:1,sourceOffsetMs}],2);
   const unpadded=render(args,{pad:false});
   assert.equal(unpadded.length/4,96000,`${label}: loop must supply the entire duration without apad`);
   const padded=render(args);
   assert.equal(padded.length/4,96000,`${label}: final mix duration`);
   assert.ok(rmsTail(padded)>.03,`${label}: final 5 ms must contain audio`);
   const legacy=render(args,{legacy:true,pad:false});
   console.log(`${label}: fixed ${unpadded.length/4} samples; legacy ${legacy.length/4}; tail RMS ${rmsTail(padded).toFixed(5)}`);
  }
 }
 console.log('PASS: all tagged-loop fixtures supply 96000 samples without silent padding.');
}finally{
 if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('webvideo-audio-loop-'))throw Error('Unexpected audio fixture cleanup path');
 fs.rmSync(directory,{recursive:true,force:true});
}
