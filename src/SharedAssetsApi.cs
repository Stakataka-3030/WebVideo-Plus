using System;using System.IO;using System.Linq;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed partial class QueueService {
  bool SharedEditingEnabled{get{return J.A(J.Get(config,"modules")).Select(Convert.ToString).Contains("sharedAssets");}}
  readonly SharedAssets sharedAssets;SharedResourceServer sharedResources;
  SharedAssets SharedStore{get{return sharedAssets;}}
  string SharedProject(string name){if(string.IsNullOrWhiteSpace(name)||Path.GetFileName(name)!=name)throw new ArgumentException("项目名称无效");foreach(string root in new[]{TerreUserData.GamesRoot(terreDir),gamesRoot}.Distinct(StringComparer.OrdinalIgnoreCase)){string project=Files.Under(root,name);if(!Directory.Exists(project))continue;SharedAssets.NoLinks(root,project);return project;}throw new IOException("项目目录不存在");}
  async Task<HttpResponse> SharedRequest(HttpRequest r){
   if(r.Path=="/api/shared/libraries"&&r.Method=="GET"){if(sharedResources!=null)sharedResources.Start();var catalog=J.D(SharedStore.Catalog());catalog["resourcePrefix"]=SharedStore.HttpPrefix;catalog["resourceError"]=sharedResources==null?"共享资源服务尚未就绪":sharedResources.Error;return HttpResponse.Data(catalog);}
   if(r.Method=="POST"&&new[]{"/api/shared/add","/api/shared/relocate","/api/shared/remove","/api/shared/upgrade-project","/api/shared/copy","/api/shared/dialog"}.Contains(r.Path)&&!SharedEditingEnabled)return HttpResponse.Data(J.O("error","共享素材模块已关闭；可在安装器中启用。"),409);
   if(r.Method!="POST")return HttpResponse.Data(J.O("error","接口不存在"),404);var data=r.Json;
   if(r.Path=="/api/shared/dialog")return HttpResponse.Data(await App.OnUI(()=>NativeDialogs.SelectFolder(J.S(data,"initial"),"选择共享素材文件夹")));
   if(r.Path=="/api/shared/add")return HttpResponse.Data(SharedStore.Add(J.S(data,"path"),J.S(data,"kind","all"),J.S(data,"name")));
   if(r.Path=="/api/shared/relocate")return HttpResponse.Data(SharedStore.Relocate(J.S(data,"id"),J.S(data,"path")));
   if(r.Path=="/api/shared/remove"){SharedStore.Remove(J.S(data,"id"));return HttpResponse.Data(J.O("ok",true));}
   if(r.Path=="/api/shared/upgrade-project")return HttpResponse.Data(await Task.Run(()=>UpgradeSharedProject(data)));
   if(r.Path=="/api/shared/export")return HttpResponse.Data(await SharedExport(data));
   if(r.Path=="/api/shared/list")return HttpResponse.Data(SharedStore.List(J.S(data,"id"),J.S(data,"path")));
   if(r.Path=="/api/shared/resolve"){sharedResources.Start();if(sharedResources.Error!=null)throw new IOException(sharedResources.Error);return HttpResponse.Data(J.O("url",SharedStore.ResourceUrl(J.S(data,"kind"),J.S(data,"reference"))));}
   if(r.Path=="/api/shared/copy"){string project=SharedProject(J.S(data,"project"));return HttpResponse.Data(await Task.Run(()=>SharedStore.Copy(J.S(data,"requestId"),project,J.S(data,"kind"),J.S(data,"reference"),J.S(data,"name"),workRoot,EngineAdapter.Select(J.O("project",project,"engineRoot",Path.Combine(terreDir,"assets/templates/WebGAL_Template"),"settings",J.O("engine","webgal"))))));}
   if(r.Path=="/api/shared/materialize"){
    string name=J.S(data,"project"),project=SharedProject(name),exportRoot=Files.Under(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(project)),"Exported_Games"),name),target=Files.Full(J.S(data,"outputGameDir"));
    if(!Files.Within(exportRoot,target)||Path.GetFileName(target)!="game")throw new IOException("游戏导出目录无效");SharedAssets.NoLinks(Path.GetPathRoot(target),target);
    var adapter=EngineAdapter.Select(J.O("project",project,"engineRoot",Path.Combine(terreDir,"assets/templates/WebGAL_Template"),"settings",J.O("engine","webgal")));
    var assets=new ProjectAssets(project,Path.GetDirectoryName(target),adapter.Source,"",null,adapter){Shared=SharedStore};foreach(var scene in J.A(J.Get(data,"scenes")))assets.CollectSharedScene(J.Get(scene,"parsed"));assets.CollectSharedConfig(J.S(data,"configText"));return HttpResponse.Data(J.O("manifest",assets.CopyShared()));
   }
   return HttpResponse.Data(J.O("error","接口不存在"),404);
  }
 }
}
