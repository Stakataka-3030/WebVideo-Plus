using System;using System.IO;using System.Linq;using NativeVideo;
class GpuAdapterChecks {
 static int passed;
 static void Check(bool ok,string name){if(!ok)throw new Exception(name);passed++;Console.WriteLine("PASS "+name);}
 static void Throws(Action action,string name){bool caught=false;try{action();}catch(ArgumentException){caught=true;}catch(IOException){caught=true;}Check(caught,name);}
 static void Main(string[] args){try{Run(args);}catch(Exception error){Console.Error.WriteLine(error.Message);Environment.ExitCode=1;}}
 static void Run(string[] args){
  var intel=new GpuAdapterInfo{Name="Integrated",Luid="0,17",VendorId=0x8086,DeviceId=0xa788,HighPerformanceRank=1,MinimumPowerRank=0};
  var nvidia=new GpuAdapterInfo{Name="Discrete",Luid="0,23",VendorId=0x10de,DeviceId=0x28a1,HighPerformanceRank=0,MinimumPowerRank=1};
  var warp=new GpuAdapterInfo{Name="WARP",Luid="0,3",Software=true,HighPerformanceRank=0,MinimumPowerRank=0};
  var catalog=new GpuAdapterCatalog{Adapters=new[]{warp,intel,nvidia},PreferenceAvailable=true};
  Check(GpuAdapters.NormalizeLuid("")=="","empty selection");Check(GpuAdapters.NormalizeLuid("-2147483648,4294967295")=="-2147483648,4294967295","signed high and unsigned low preserved");
  Check(J.S(Settings.Validate(null),"gpuAdapterLuid")=="","settings default preserves automatic selection");
  Check(!J.B(Settings.Validate(null),"preciseTextboxLoopAnimations",true),"precise textbox loop animations defaults off");
  Check(J.B(Settings.Validate(J.O("preciseTextboxLoopAnimations",true)),"preciseTextboxLoopAnimations"),"precise textbox loop animations true preserved");
  Check(!J.B(Settings.Validate(J.O("preciseTextboxLoopAnimations",false)),"preciseTextboxLoopAnimations",true),"precise textbox loop animations false preserved");
  foreach(string value in new[]{"0,17","-2147483648,4294967295","1,00023","   "})Check(J.S(Settings.Validate(J.O("gpuAdapterLuid",value)),"gpuAdapterLuid")==GpuAdapters.NormalizeLuid(value),"settings and adapter LUID parsing agree: "+value);
  foreach(object value in new object[]{null,0,true,new object[0],J.O("luid","0,17")})Throws(()=>Settings.Validate(J.O("gpuAdapterLuid",value)),"settings reject non-text LUID "+(value==null?"null":value.GetType().Name));
  foreach(string value in new[]{"0,0","1,-2","2147483648,0","1,4294967296","0,17 --disable-web-security","1,2,3","0x1,2"})Throws(()=>Settings.Validate(J.O("gpuAdapterLuid",value)),"settings reject invalid LUID "+value);
  Check(J.S(Settings.Validate(J.O("gpu","high","gpuAdapterLuid","0,17","gpuRawMode","qsv")),"gpuRawMode")=="quality","render adapter setting preserves existing qsv-to-quality normalization");
  foreach(string invalid in new[]{"0,0","1,-2","2147483648,0","1,4294967296","0,17 --disable-web-security","1,2,3","0x1,2"})Throws(()=>GpuAdapters.NormalizeLuid(invalid),"reject "+invalid);
  var high=GpuAdapters.Select("high","",catalog);Check(high.Selected==nvidia,"high preference uses DXGI rank, skips software");Check(high.Arguments.Contains("--use-angle=d3d11 --use-adapter-luid=0,23"),"explicit ANGLE LUID argument");
  Check(GpuAdapters.Select("low","",catalog).Selected==intel,"low preference uses DXGI rank");Check(GpuAdapters.Select("auto","",catalog).Selected==null,"auto leaves adapter selection to runtime");Check(GpuAdapters.Select("auto","",catalog).Arguments=="","auto adds no new rendering flags");
  var manual=GpuAdapters.Select("high","0,17",catalog);Check(manual.Selected==intel,"manual LUID overrides preference");Check(!manual.Arguments.Contains("force_high"),"manual choice has no conflicting high preference hint");Throws(()=>GpuAdapters.Select("auto","0,99",catalog),"missing device fails explicitly");Throws(()=>GpuAdapters.Select("auto","0,3",catalog),"software device not selectable");
  var old=new GpuAdapterCatalog{Adapters=new[]{intel,nvidia},PreferenceAvailable=false};var hint=GpuAdapters.Select("high","",old);Check(hint.Selected==null&&hint.Method=="preference-hint-only"&&!hint.Arguments.Contains("use-angle"),"old DXGI keeps previous hint and records limitation");
  Check(J.S(GpuAdapters.Verify(high,null),"verification")=="not-observed","startup has not yet observed the renderer");
  var same=GpuAdapters.Verify(high,J.O("renderer","ANGLE (NVIDIA, NVIDIA GeForce RTX (0x000028A1) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor","Google Inc. (NVIDIA)"));Check(J.S(same,"verification")=="adapter-model-match"&&!J.B(same,"exactLuidConfirmed")&&J.Get(same,"actualLuid")==null,"matching model never claims exact LUID");
  var different=GpuAdapters.Verify(high,J.O("renderer","ANGLE (Intel, Intel UHD (0x0000A788) Direct3D11, D3D11)","vendor","Google Inc. (Intel)"));Check(J.S(different,"verification")=="adapter-model-mismatch","different observed GPU identified");
  Check(J.S(GpuAdapters.Verify(high,J.O("renderer","ANGLE (NVIDIA GeForce, D3D11)","vendor","NVIDIA")),"verification")=="unverified","vendor alone is insufficient");Check(J.S(GpuAdapters.Verify(high,J.O("error","not supported")),"verification")=="unavailable","unsupported observation is explicit");
  Check(J.S(GpuAdapters.Verify(high,J.O("renderer","ANGLE (SwiftShader Device)")),"verification")=="adapter-model-mismatch","software fallback identified");
  var duplicate=new GpuAdapterInfo{Name="Same model",Luid="0,24",VendorId=nvidia.VendorId,DeviceId=nvidia.DeviceId};catalog.Adapters=new[]{intel,nvidia,duplicate};Check(J.S(GpuAdapters.Verify(high,J.O("renderer","ANGLE (NVIDIA GeForce (0x000028A1), D3D11)","vendor","NVIDIA")),"verification")=="adapter-model-ambiguous","duplicate device models remain ambiguous");
  var live=GpuAdapters.Enumerate();Check(live.Adapters.Select(a=>a.Luid).Distinct().Count()==live.Adapters.Length,"read-only native enumeration unique IDs");foreach(var adapter in live.Adapters)Check(GpuAdapters.NormalizeLuid(adapter.Luid)==adapter.Luid,"native LUID round trip "+adapter.Name);
  J.Write(args[0],J.O("passed",passed,"catalog",live.Json(),"scope","unit decisions plus read-only DXGI enumeration; no WebView2 or benchmark"));Console.WriteLine("PASSED "+passed);
 }
}
