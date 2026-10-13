using System;using System.Collections;using System.Collections.Generic;using System.Globalization;using System.Linq;using System.Text.RegularExpressions;
namespace NativeVideo {
 // Statement anchors are source positions, never executable script or saved project edits.
 // Collect before SceneChain.AttachTimeline replaces global lineTimes with scene-local times.
 public static class StatementCuts {
  sealed class Origin {public string Scene;public int Line,Occurrence;}
  sealed class Statement {public int First,Last,Index;public string Command;public bool Comment;}
  static bool Numeric(object value){return value is byte||value is sbyte||value is short||value is ushort||value is int||value is uint||value is long||value is ulong||value is float||value is double||value is decimal;}
  static int Integer(object value,int minimum,string name){
   if(!Numeric(value))throw new ArgumentException("语句切点的 "+name+" 必须是整数");
   double number=Convert.ToDouble(value,CultureInfo.InvariantCulture);
   if(double.IsNaN(number)||double.IsInfinity(number)||number<minimum||number>int.MaxValue||number!=Math.Truncate(number))throw new ArgumentException("语句切点的 "+name+" 无效");
   return (int)number;
  }
  static string Scene(object value){
   var text=value as string;if(text==null)throw new ArgumentException("语句切点缺少场景路径");text=text.Trim().Replace('\\','/');
   // Keep the same optional project-relative prefixes as SceneChain.NormalizeScene.
   if(text.StartsWith("./game/scene/",StringComparison.OrdinalIgnoreCase))text=text.Substring(13);else if(text.StartsWith("game/scene/",StringComparison.OrdinalIgnoreCase))text=text.Substring(11);else if(text.StartsWith("./",StringComparison.Ordinal))text=text.Substring(2);
   if(text==""||text.StartsWith("/",StringComparison.Ordinal)||Regex.IsMatch(text,@"[\x00-\x1f<>:""|?*#${}]")||text.Split('/').Any(part=>string.IsNullOrWhiteSpace(part)||part=="."||part=="..")||!text.EndsWith(".txt",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("语句切点场景必须是项目内的相对 .txt 路径");
   return text;
  }
  static string Label(object value){
   if(value==null)return "";var text=value as string;if(text==null)throw new ArgumentException("语句切点说明必须是文本");
   text=Regex.Replace(text,@"[\s\p{Cc}]+"," ").Trim();if(text.Length<=120)return text;int length=char.IsHighSurrogate(text[119])?119:120;return text.Substring(0,length);
  }
  public static object[] ValidateSelections(object supplied){
   if(supplied==null)return new object[0];
   if(!(supplied is IList)||supplied is string)throw new ArgumentException("临时语句切点必须是数组");
   var result=new List<object>();foreach(var suppliedAnchor in J.A(supplied)){
    if(!(suppliedAnchor is Dictionary<string,object>))throw new ArgumentException("临时语句切点格式无效");
    string scene=Scene(J.Get(suppliedAnchor,"scene")),hash=J.Get(suppliedAnchor,"sourceHash") as string;
    if(hash==null||!Regex.IsMatch(hash,@"\A[0-9a-fA-F]{64}\z"))throw new ArgumentException("临时语句切点缺少有效的剧本校验值，请重新选择");
    int line=Integer(J.Get(suppliedAnchor,"line"),1,"line"),occurrence=J.D(suppliedAnchor).ContainsKey("occurrence")?Integer(J.Get(suppliedAnchor,"occurrence"),1,"occurrence"):1;
    var anchor=J.O("scene",scene,"line",line,"sourceHash",hash.ToLowerInvariant(),"label",Label(J.Get(suppliedAnchor,"label")),"occurrence",occurrence);
    if(J.D(suppliedAnchor).ContainsKey("endLine")){int end=Integer(J.Get(suppliedAnchor,"endLine"),line,"endLine");anchor["endLine"]=end;}
    result.Add(anchor);
   }
   return result.ToArray();
  }
  static double? Time(Statement statement,List<object> times){
   if(statement.Index>=times.Count||!Numeric(times[statement.Index]))return null;
   double value=Convert.ToDouble(times[statement.Index],CultureInfo.InvariantCulture);return double.IsNaN(value)||double.IsInfinity(value)||value<0?null:(double?)value;
  }
  static string Place(Origin origin){return origin.Scene+":"+origin.Line;}
  static string OriginKey(string scene,int line,int occurrence){return scene+"|"+line+"|"+occurrence;}
  static List<Statement> ReadStatements(object parsed,int lineCount){
   var sentences=J.A(J.Get(parsed,"sentenceList"));var statements=new List<Statement>();
   for(int index=0;index<sentences.Count;index++){
    var sentence=sentences[index];if(J.B(sentence,"isLineBreakHolder"))continue;
    int first=Integer(J.Get(sentence,"startLine"),0,"解析起始行"),last=Integer(J.Get(sentence,"endLine"),first,"解析结束行");
    if(last>=lineCount)throw new ArgumentException("语句切点的解析边界超过剧本");
    string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");
    statements.Add(new Statement{First=first,Last=last,Index=index,Command=command,Comment=command=="comment"||command=="__commment"});
   }
   statements=statements.OrderBy(s=>s.First).ToList();for(int i=1;i<statements.Count;i++)if(statements[i].First<=statements[i-1].Last)throw new ArgumentException("语句切点的解析边界重叠");return statements;
  }
  static Dictionary<string,object> Warning(string code,string message,string source,Origin origin,int globalLine){return J.O("code",code,"message",message,"source",source,"scene",origin.Scene,"line",origin.Line,"occurrence",origin.Occurrence,"globalLine",globalLine);}
  static Dictionary<string,object> Candidate(string source,Origin anchor,int anchorGlobalLine,Statement target,Origin[] origins,double atMs,string label){
   var origin=origins[target.First];return J.O("source",source,"scene",anchor.Scene,"line",anchor.Line,"occurrence",anchor.Occurrence,"anchorGlobalLine",anchorGlobalLine,"targetScene",origin.Scene,"targetLine",origin.Line,"targetEndLine",origins[target.Last].Line,"targetOccurrence",origin.Occurrence,"globalLine",target.First+1,"atMs",atMs,"command",target.Command,"label",label);
  }
  public static object Collect(string script,object parsed,object timing,object chain,object selections,object executionParsed=null){
   var anchors=ValidateSelections(selections);var lines=(script??"").TrimStart('\uFEFF').Replace("\r\n","\n").Split('\n');
   var map=J.A(J.Get(chain,"originMap"));if(map.Count!=lines.Length)throw new ArgumentException("语句切点的故事来源映射与剧本行数不一致");
   var origins=new Origin[map.Count];var encounters=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);var originIndex=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
   for(int i=0;i<map.Count;i++){
    string scene=Scene(J.Get(map[i],"scene"));int line=Integer(J.Get(map[i],"line"),1,"来源行号"),occurrence;
    if(i==0||!scene.Equals(origins[i-1].Scene,StringComparison.OrdinalIgnoreCase)||line!=origins[i-1].Line+1){encounters.TryGetValue(scene,out occurrence);encounters[scene]=++occurrence;}else occurrence=origins[i-1].Occurrence;
    origins[i]=new Origin{Scene=scene,Line=line,Occurrence=occurrence};
    originIndex.Add(OriginKey(scene,line,occurrence),i);
   }
   var statements=ReadStatements(parsed,lines.Length);var finalStatements=executionParsed==null?statements:ReadStatements(executionParsed,lines.Length);
   var byStart=statements.ToDictionary(s=>s.First);var finalByStart=finalStatements.ToDictionary(s=>s.First);var executable=finalStatements.Where(s=>!s.Comment).ToList();var times=J.A(J.Get(timing,"lineTimes"));
   // Final parser indexes can differ after a multiline command is sanitized.
   // Markers follow the next statement that will really execute, but end is a barrier.
   var nextAfter=new Statement[lines.Length];Statement nextExecutable=null;
   for(int lineIndex=lines.Length-1;lineIndex>=0;lineIndex--){nextAfter[lineIndex]=nextExecutable;Statement current;if(finalByStart.TryGetValue(lineIndex,out current)&&!current.Comment&&(current.Command=="end"||Time(current,times).HasValue))nextExecutable=current;}
   var terminal=executable.FirstOrDefault(s=>s.Command=="end");int terminalLine=terminal==null?int.MaxValue:terminal.First;
   var candidates=new List<object>();var warnings=new List<object>();var sceneMetadata=J.A(J.Get(chain,"scenes"));var flattened=J.A(J.Get(chain,"flattened"));
   foreach(var anchor in anchors){
    string scene=J.S(anchor,"scene");int line=(int)J.N(anchor,"line"),occurrence=(int)J.N(anchor,"occurrence");
    var metadata=sceneMetadata.Where(item=>J.S(item,"scene").Equals(scene,StringComparison.OrdinalIgnoreCase)).ToArray();
    if(metadata.Length==0)throw new ArgumentException("临时切点场景不在当前故事链中："+scene);
    int totalOccurrences;if(!encounters.TryGetValue(scene,out totalOccurrences)||occurrence>totalOccurrences)throw new ArgumentException("临时切点指定的场景出现次数不存在："+scene+" #"+occurrence);
    object source=metadata.Length==1?metadata[0]:occurrence<=metadata.Length?metadata[occurrence-1]:null;
    if(source==null||!J.S(source,"hash").Equals(J.S(anchor,"sourceHash"),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("临时切点对应的剧本已经变化，请重新选择："+scene);
    int sceneLines=Integer(J.Get(source,"lines"),1,"场景总行数");if(line>sceneLines||J.N(anchor,"endLine",line)>sceneLines)throw new ArgumentException("临时切点超出场景范围："+scene+":"+line);
    int global;if(!originIndex.TryGetValue(OriginKey(scene,line,occurrence),out global))throw new ArgumentException("临时切点没有对应的故事来源行："+scene+":"+line);
    if(global>terminalLine)throw new ArgumentException("临时切点位于 end 之后，不会实际执行："+scene+":"+line);
    Statement statement;byStart.TryGetValue(global,out statement);Statement executed=null;
    var transfer=flattened.FirstOrDefault(item=>J.S(item,"from").Equals(scene,StringComparison.OrdinalIgnoreCase)&&J.N(item,"line")==line);
    // Flattened static changeScene is a verified zero-duration statement boundary.
    if(transfer!=null&&statement!=null&&statement.Comment){
     int last=Integer(J.Get(transfer,"endLine",line),line,"场景跳转结束行");
     if(last>sceneLines||global+last-line>=origins.Length)throw new ArgumentException("临时切点的场景跳转语句边界无效："+Place(origins[global]));
     for(int offset=0;offset<=last-line;offset++){var origin=origins[global+offset];if(!origin.Scene.Equals(scene,StringComparison.OrdinalIgnoreCase)||origin.Occurrence!=occurrence||origin.Line!=line+offset)throw new ArgumentException("临时切点的场景跳转语句跨越了来源边界："+Place(origins[global]));}
     if(J.D(anchor).ContainsKey("endLine")&&J.N(anchor,"endLine")!=last)throw new ArgumentException("临时切点的场景跳转语句边界已变化，请重新选择："+Place(origins[global]));
     statement=nextAfter[global];
     if(statement==null||statement.Command=="end"){
      warnings.Add(Warning("selection-no-target","场景跳转切点之后没有可导出的执行语句", "selection",origins[global],global+1));continue;
     }
     executed=statement;
    }else{
     if(statement==null||statement.Comment)throw new ArgumentException("临时切点必须选择可执行语句的起始行，不能选择注释或多行语句内部："+Place(origins[global]));
     for(int offset=0;offset<=statement.Last-statement.First;offset++){
      var origin=origins[global+offset];if(!origin.Scene.Equals(scene,StringComparison.OrdinalIgnoreCase)||origin.Occurrence!=occurrence||origin.Line!=line+offset)throw new ArgumentException("临时切点语句跨越了场景来源边界："+Place(origins[global]));
     }
     if(J.D(anchor).ContainsKey("endLine")&&J.N(anchor,"endLine")!=origins[statement.Last].Line)throw new ArgumentException("临时切点的语句边界已变化，请重新选择完整语句："+Place(origins[global]));
    }
    if(statement.Command=="end"){warnings.Add(Warning("selection-endpoint","end 是故事结束边界，临时切点已忽略", "selection",origins[global],global+1));continue;}
    if(executed==null&&(!finalByStart.TryGetValue(statement.First,out executed)||executed.Comment))throw new ArgumentException("临时切点对应的语句已在导出副本中跳过，请重新选择："+Place(origins[global]));
    double? atMs=Time(executed,times);if(!atMs.HasValue)throw new ArgumentException("临时切点语句没有实际执行时间，请重新选择："+Place(origins[global]));
    var candidate=Candidate("selection",origins[global],global+1,statement,origins,atMs.Value,J.S(anchor,"label"));candidate["sourceHash"]=J.S(anchor,"sourceHash");if(transfer!=null)candidate["flattenedChangeScene"]=true;candidates.Add(candidate);
   }
   foreach(var marker in statements.Where(s=>s.Comment&&s.First==s.Last&&Regex.IsMatch(lines[s.First],@"\A\s*;CutHere\s*\z"))){
    var origin=origins[marker.First];var next=nextAfter[marker.First];
    if(marker.First>terminalLine){warnings.Add(Warning("marker-unreachable",";CutHere 位于 end 之后，已忽略", "marker",origin,marker.First+1));continue;}
    if(next==null||next.Command=="end"){
     warnings.Add(Warning(next==null?"marker-no-target":"marker-before-end",";CutHere 之后没有可导出的执行语句，已忽略", "marker",origin,marker.First+1));continue;
    }
    double? atMs=Time(next,times);if(!atMs.HasValue){warnings.Add(Warning("marker-target-untimed",";CutHere 的下一条语句没有实际执行时间，已忽略", "marker",origin,marker.First+1));continue;}
    candidates.Add(Candidate("marker",origin,marker.First+1,next,origins,atMs.Value,";CutHere"));
   }
   return J.O("schemaVersion",1,"candidates",candidates.OrderBy(item=>J.N(item,"atMs")).ThenBy(item=>J.N(item,"globalLine")).ThenBy(item=>J.N(item,"anchorGlobalLine")).ThenBy(item=>J.S(item,"source"),StringComparer.Ordinal).ToArray(),"warnings",warnings.ToArray());
  }
 }
}
