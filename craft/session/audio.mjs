import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
export async function audioDuration(file,{ffprobe='ffprobe'}={}){
  if(!path.isAbsolute(file)||!['.wav','.mp3','.ogg','.flac','.m4a','.aac','.webm','.opus'].includes(path.extname(file).toLowerCase()))throw Error('audio-path-invalid');
  const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>128*1024*1024)throw Error('audio-file-invalid');
  const {stdout}=await promisify(execFile)(ffprobe,['-v','error','-show_entries','format=duration','-of','json',file],{timeout:30000,maxBuffer:1024*1024,windowsHide:true});
  const seconds=Number(JSON.parse(stdout).format?.duration);if(!Number.isFinite(seconds)||seconds<=0||seconds>86400)throw Error('audio-duration-invalid');return {durationSeconds:seconds};
}
