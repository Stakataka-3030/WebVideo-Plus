using System;using System.Linq;using System.Collections.Generic;
namespace NativeVideo {
 public static class ModuleCatalog {
  public static readonly string[] Selectable={"sharedAssets","timelineNavigator","timelineSelector","videoWorkflow","idTools","expressionPrep","filter","filterEdit","batchNext","autoExit","presetEffects","musicTimeline","subtitles","textImport","checks","backups","exporter","layerExport","compactGameTools","generativeAI"};
  public static readonly string[] Advanced=Selectable.Where(id=>id!="generativeAI").ToArray();
  public static readonly Dictionary<string,string> Labels=new Dictionary<string,string>{{"sharedAssets","共享素材与项目资源"},{"generativeAI","安装基于生成式AI的组件"},{"timelineNavigator","剧情导航"},{"timelineSelector","导出片段选择"},{"videoWorkflow","剧情实际时间"},{"idTools","一键id补全"},{"expressionPrep","预位表情调整"},{"filter","批量滤镜"},{"filterEdit","修改已有滤镜"},{"batchNext","批量加-next"},{"autoExit","自动离场"},{"presetEffects","Video+预制效果"},{"musicTimeline","配置导出音乐"},{"subtitles","字幕后处理"},{"textImport","导入Anogo故事"},{"checks","检查与标记"},{"backups","备份与恢复 / 自动备份"},{"exporter","导出视频"},{"layerExport","分层导出（舞台/对话框/音轨）"},{"compactGameTools","游戏工具收纳"},{"timelineCore","时间线基础"},{"projectCore","编辑工具基础"},{"exportKernel","本机服务与导出内核"}};
  static readonly Dictionary<string,string[]> Dependencies=new Dictionary<string,string[]>{{"sharedAssets",new[]{"exportKernel"}},{"generativeAI",new[]{"backups"}},{"timelineNavigator",new[]{"timelineCore"}},{"timelineSelector",new[]{"timelineCore"}},{"exporter",new[]{"exportKernel","timelineSelector"}},{"layerExport",new[]{"exporter"}},{"idTools",new[]{"backups"}},{"expressionPrep",new[]{"backups"}},{"filter",new[]{"backups"}},{"filterEdit",new[]{"backups"}},{"batchNext",new[]{"backups"}},{"autoExit",new[]{"backups"}},{"presetEffects",new[]{"backups"}},{"musicTimeline",new[]{"backups"}},{"subtitles",new[]{"exporter"}},{"textImport",new[]{"backups"}},{"checks",new[]{"projectCore","timelineSelector"}},{"backups",new[]{"projectCore","exportKernel"}},{"videoWorkflow",new[]{"projectCore","timelineSelector","timelineNavigator","exportKernel"}},{"projectCore",new[]{"timelineCore"}},{"compactGameTools",new string[0]},{"timelineCore",new string[0]},{"exportKernel",new string[0]}};
  public static string[] Normalize(IEnumerable<string> requested){var old=requested.Distinct().ToArray();var list=old.SelectMany(id=>id=="batchTools"?new[]{"expressionPrep","filter","filterEdit","batchNext","autoExit","presetEffects","backups"}:id=="projectCore"?new[]{"backups"}:new[]{id}).Where(id=>id!="timelineCore"&&id!="exportKernel").Distinct().ToArray();if(list.Except(Selectable).Any())throw new ArgumentException("存在未知或不可直接选择的模块");return list;}
  public static string[] UpgradeSharedAssetsDefault(IEnumerable<string> requested,string installedVersion,string installedInternalVersion,IEnumerable<string> recordedModules,out string note){
   var selected=requested.ToArray();note="";if(selected.Contains("sharedAssets")||recordedModules!=null&&recordedModules.Contains("sharedAssets"))return selected;
   string version=(installedVersion??"").Trim(),internalVersion=(installedInternalVersion??"").Trim();Version product=null;bool numeric=System.Text.RegularExpressions.Regex.IsMatch(version,@"^[0-9]+\.[0-9]+\.[0-9]+$")&&Version.TryParse(version,out product);
   bool line464=numeric&&product.Major==1&&product.Minor==1,line466=numeric&&product.Major==1&&product.Minor==3;
   if(line464&&product.Build>=10||line466&&product.Build>=4)return selected;
   bool old=internalVersion==""&&(line464&&product.Build<=9||line466&&product.Build<=3);
   if(internalVersion!=""){
    var candidate=System.Text.RegularExpressions.Regex.Match(internalVersion,@"^(1\.1\.9-shared\.464|1\.3\.3-shared\.466)\.([1-9][0-9]*)(?:-dev)?$");int iteration;
    if(candidate.Success&&int.TryParse(candidate.Groups[2].Value,out iteration)&&version==(candidate.Groups[1].Value.StartsWith("1.1.9-")?"1.1.9":"1.3.3")){
     if(iteration>=(candidate.Groups[1].Value.StartsWith("1.1.9-")?11:8))return selected;old=true;
    }else if(version=="1.1.9"&&(internalVersion=="0.8.14-shared.464.3"||internalVersion=="0.8.14-shared.464.3-dev")||version=="1.3.3"&&(internalVersion=="0.9.6-shared.466.1"||internalVersion=="0.9.6-shared.466.1-dev"))old=true;
    else {Version legacy;if(numeric&&Version.TryParse(internalVersion,out legacy)&&System.Text.RegularExpressions.Regex.IsMatch(internalVersion,@"^[0-9]+\.[0-9]+\.[0-9]+$")&&((line464&&product.Build<=9&&legacy<=new Version(0,8,13))||(line466&&product.Build<=3&&legacy<=new Version(0,9,5))))old=true;}
   }
   if(old)return selected.Concat(new[]{"sharedAssets"}).Distinct().ToArray();note="无法确认旧安装是否已提供共享模块，已保留共享模块的当前勾选。";return selected;
  }
  public static string[] Resolve(IEnumerable<string> requested){var list=Normalize(requested);var resolved=new HashSet<string>();Action<string> add=null;add=id=>{if(resolved.Add(id))foreach(var dependency in Dependencies[id])add(dependency);};foreach(var id in list)add(id);return Selectable.Concat(new[]{"timelineCore","projectCore","exportKernel"}).Where(resolved.Contains).ToArray();}
  public static bool NeedsKernel(IEnumerable<string> modules){return modules.Contains("exportKernel")||modules.Contains("exporter")||modules.Contains("videoWorkflow");}
  public static Dictionary<string,string[]> Graph(){return new Dictionary<string,string[]>(Dependencies);}
 }
}
