using System;using System.IO;using System.Linq;using System.Globalization;using System.Runtime.InteropServices;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public sealed class GpuAdapterInfo {
  public string Name,Luid;public uint VendorId,DeviceId;public ulong DedicatedVideoMemory;public bool Software;public int HighPerformanceRank=-1,MinimumPowerRank=-1;
  public object Json(){return J.O("name",Name,"luid",Luid,"vendorId",VendorId,"deviceId",DeviceId,"dedicatedVideoMemory",DedicatedVideoMemory,"software",Software,"highPerformanceRank",HighPerformanceRank,"minimumPowerRank",MinimumPowerRank);}
 }
 public sealed class GpuAdapterCatalog {
  public GpuAdapterInfo[] Adapters=new GpuAdapterInfo[0];public bool PreferenceAvailable;public string Error;
  public object Json(){return J.O("adapters",Adapters.Where(a=>!a.Software).Select(a=>a.Json()).ToArray(),"preferenceAvailable",PreferenceAvailable,"error",Error);}
 }
 public sealed class GpuAdapterSelection {
  public string Preference,RequestedLuid,Arguments,Method;public GpuAdapterInfo Selected;public GpuAdapterCatalog Catalog;
  public object Json(){return J.O("requestedPreference",Preference,"requestedLuid",RequestedLuid,"selectionMethod",Method,"selectedAdapter",Selected==null?null:Selected.Json(),"adapterArguments",Arguments,"catalog",Catalog.Json(),"exactLuidConfirmed",false,"verification","not-observed");}
 }
 public static class GpuAdapters {
  static readonly Guid Factory1=new Guid("770aae78-f26f-4dba-a829-253c83d1b387"),Factory6=new Guid("c1b6694f-ff09-44a9-b03c-77900a0a1d17"),Adapter1=new Guid("29038f61-3839-4626-91fd-086879011a05");
  [StructLayout(LayoutKind.Sequential)]struct Luid {public uint Low;public int High;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Description {
   [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Name;
   public uint Vendor,Device,Subsystem,Revision;public UIntPtr DedicatedVideo,DedicatedSystem,SharedSystem;public Luid Luid;public uint Flags;
  }
  [DllImport("dxgi.dll",CallingConvention=CallingConvention.StdCall)]static extern int CreateDXGIFactory1(ref Guid iid,out IntPtr factory);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int EnumAdapters(IntPtr factory,uint index,out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int EnumPreferred(IntPtr factory,uint index,uint preference,ref Guid iid,out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetDescription(IntPtr adapter,out Description description);
  static Delegate Method(IntPtr instance,int slot,Type type){return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance),slot*IntPtr.Size),type);}
  public static string NormalizeLuid(string value){
   if(string.IsNullOrWhiteSpace(value))return "";var m=Regex.Match(value,@"^(-?\d+),(\d+)$");int high;uint low;
   if(!m.Success||!int.TryParse(m.Groups[1].Value,NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out high)||!uint.TryParse(m.Groups[2].Value,NumberStyles.None,CultureInfo.InvariantCulture,out low)||high==0&&low==0)throw new ArgumentException("GPU 设备编号无效，请重新选择设备");
   return high.ToString(CultureInfo.InvariantCulture)+","+low.ToString(CultureInfo.InvariantCulture);
  }
  static GpuAdapterInfo Describe(IntPtr adapter){Description d;int hr=((GetDescription)Method(adapter,10,typeof(GetDescription)))(adapter,out d);Marshal.ThrowExceptionForHR(hr);return new GpuAdapterInfo{Name=(d.Name??"").TrimEnd('\0'),Luid=d.Luid.High.ToString(CultureInfo.InvariantCulture)+","+d.Luid.Low.ToString(CultureInfo.InvariantCulture),VendorId=d.Vendor,DeviceId=d.Device,DedicatedVideoMemory=d.DedicatedVideo.ToUInt64(),Software=(d.Flags&2)!=0};}
  public static object Catalog(){return Enumerate().Json();}
  public static GpuAdapterCatalog Enumerate(){
   var result=new GpuAdapterCatalog();IntPtr factory=IntPtr.Zero;var adapters=new List<GpuAdapterInfo>();
   try{
    Guid iid=Factory1;Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid,out factory));
    var enumerate=(EnumAdapters)Method(factory,12,typeof(EnumAdapters)); // IDXGIFactory1::EnumAdapters1.
    for(uint index=0;index<64;index++){IntPtr adapter;int hr=enumerate(factory,index,out adapter);if(hr==unchecked((int)0x887a0002))break;Marshal.ThrowExceptionForHR(hr);try{adapters.Add(Describe(adapter));}finally{if(adapter!=IntPtr.Zero)Marshal.Release(adapter);}}
    IntPtr preferred=IntPtr.Zero;iid=Factory6;int preferenceHr=CreateDXGIFactory1(ref iid,out preferred);
    if(preferenceHr>=0)try{
     var enumeratePreferred=(EnumPreferred)Method(preferred,29,typeof(EnumPreferred)); // IDXGIFactory6::EnumAdapterByGpuPreference.
     foreach(uint preference in new uint[]{1,2})for(uint index=0;index<64;index++){IntPtr adapter;Guid adapterIid=Adapter1;int hr=enumeratePreferred(preferred,index,preference,ref adapterIid,out adapter);if(hr==unchecked((int)0x887a0002))break;Marshal.ThrowExceptionForHR(hr);try{string luid=Describe(adapter).Luid;var item=adapters.FirstOrDefault(a=>a.Luid==luid);if(item!=null){if(preference==1)item.MinimumPowerRank=(int)index;else item.HighPerformanceRank=(int)index;}}finally{if(adapter!=IntPtr.Zero)Marshal.Release(adapter);}}
     result.PreferenceAvailable=true;
    }finally{if(preferred!=IntPtr.Zero)Marshal.Release(preferred);}
   }catch(Exception e){result.Error=e.GetType().Name+": "+e.Message;}finally{if(factory!=IntPtr.Zero)Marshal.Release(factory);result.Adapters=adapters.ToArray();}
   return result;
  }
  public static GpuAdapterSelection Select(string preference,string requestedLuid="",GpuAdapterCatalog catalog=null){
   if(!new[]{"auto","high","low"}.Contains(preference))throw new ArgumentException("GPU 偏好无效");string luid=NormalizeLuid(requestedLuid);catalog=catalog??Enumerate();var hardware=catalog.Adapters.Where(a=>!a.Software).ToArray();GpuAdapterInfo selected=null;
   if(luid!=""){selected=hardware.FirstOrDefault(a=>a.Luid==luid);if(selected==null)throw new IOException("所选 GPU 已不可用，请重新选择设备："+luid);}
   else if(preference!="auto"&&catalog.PreferenceAvailable)selected=hardware.Where(a=>preference=="high"?a.HighPerformanceRank>=0:a.MinimumPowerRank>=0).OrderBy(a=>preference=="high"?a.HighPerformanceRank:a.MinimumPowerRank).FirstOrDefault();
   string flags=luid!=""?"":preference=="high"?" --force_high_performance_gpu":preference=="low"?" --force_low_power_gpu":"";
   if(selected!=null)flags+=" --use-angle=d3d11 --use-adapter-luid="+NormalizeLuid(selected.Luid);
   return new GpuAdapterSelection{Preference=preference,RequestedLuid=luid,Catalog=catalog,Selected=selected,Arguments=flags,Method=luid!=""?"explicit-luid":selected!=null?"dxgi-preference-luid":preference=="auto"?"automatic":"preference-hint-only"};
  }
  public static object Verify(GpuAdapterSelection selection,object observation){
   var data=J.D(selection.Json());string renderer=J.S(observation,"renderer"),vendor=J.S(observation,"vendor");data["actual"]=observation;data["actualLuid"]=null;data["observedAtUtc"]=DateTime.UtcNow.ToString("o");data["exactLuidConfirmed"]=false;
   if(observation==null){data["verification"]="not-observed";data["verificationNote"]="尚未读取实际渲染器";return data;}
   if(renderer==""){data["verification"]="unavailable";data["verificationNote"]="当前运行时未提供渲染设备信息，无法确认选卡结果";return data;}
   bool software=Regex.IsMatch(renderer,"SwiftShader|WARP|Software|Microsoft Basic Render",RegexOptions.IgnoreCase);
   var match=Regex.Match(renderer,@"\(0x([0-9a-fA-F]{4,8})\)");uint device=0;bool hasDevice=match.Success&&uint.TryParse(match.Groups[1].Value,NumberStyles.HexNumber,CultureInfo.InvariantCulture,out device);
   string all=renderer+" "+vendor;uint vendorId=Regex.IsMatch(all,"NVIDIA",RegexOptions.IgnoreCase)?0x10deu:Regex.IsMatch(all,"Intel",RegexOptions.IgnoreCase)?0x8086u:Regex.IsMatch(all,"AMD|ATI|Radeon",RegexOptions.IgnoreCase)?0x1002u:0;
   data["actualVendorId"]=vendorId;data["actualDeviceId"]=hasDevice?(object)device:null;
   if(selection.Selected==null){data["verification"]=software?"software-renderer":"observed-auto";data["verificationNote"]="已记录实际渲染器；未请求特定 LUID";}
   else if(software||vendorId!=0&&vendorId!=selection.Selected.VendorId||hasDevice&&device!=selection.Selected.DeviceId){data["verification"]="adapter-model-mismatch";data["verificationNote"]="实际渲染器与请求设备不符；浏览器参数可能未生效或运行时已回退";}
   else if(hasDevice&&vendorId==selection.Selected.VendorId){int count=selection.Catalog.Adapters.Count(a=>!a.Software&&a.VendorId==vendorId&&a.DeviceId==device);data["verification"]=count==1?"adapter-model-match":"adapter-model-ambiguous";data["verificationNote"]="渲染器型号相符；当前 WebView2 接口未回读 LUID，不能确认特定适配器身份";}
   else{data["verification"]="unverified";data["verificationNote"]="已记录渲染器，但信息不足以确认请求设备；LUID 未回读";}
   return data;
  }
 }
}
