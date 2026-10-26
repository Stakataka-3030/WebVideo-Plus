from pathlib import Path
import sys,json,zipfile,hashlib,re
file=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).with_name('BtbN-FFmpeg-win64-gpl-9.0-20260930-source-materials.zip')
with zipfile.ZipFile(file) as z:
 manifest=json.loads(z.read('SOURCE-MATERIALS-MANIFEST.json'));expected={'README.md','DEPENDENCY-NOTICES.txt','SOURCE-MATERIALS-MANIFEST.json'}
 seen=set()
 for info in z.infolist():
  name=info.filename
  if name.startswith('/') or '\\' in name or ':' in name or '..' in name.split('/') or name.lower() in seen:raise ValueError('Unsafe/duplicate source delivery path '+name)
  seen.add(name.lower())
 for row in manifest['sourceRecords']:
  name=row['bundlePath'];expected.add(name)
  assert re.fullmatch('[0-9a-f]{64}',row['sha256'])
  info=z.getinfo(name);assert info.file_size==row['bytes'],name
  h=hashlib.sha256()
  with z.open(name) as f:
   while chunk:=f.read(1024*1024):h.update(chunk)
  assert h.hexdigest()==row['sha256'],name
 assert {i.filename for i in z.infolist()}==expected,'Unexpected or missing delivery entries'
 print(json.dumps({'verifiedSourceRecords':len(manifest['sourceRecords']),'sourceDeliveryFiles':len(expected),'ffmpegCommit':manifest['ffmpegCommit'],'allLengthsAndSha256Match':True,'execution':'none','publicationVerified':False}))
