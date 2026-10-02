using System;using System.Linq;using System.Collections.Generic;
namespace NativeVideo {
 public static class StatementCutChecks {
  static int checks;static readonly string HashA=new string('a',64),HashB=new string('b',64);
  static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
  static void Reject(Action action,string message){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}Check(rejected,message);}
  static object Statement(int first,string command,int last=-1,bool holder=false){return J.O("startLine",first,"endLine",last<0?first:last,"command",command=="say"?0:99,"commandRaw",command=="say"?"A":command,"isLineBreakHolder",holder);}
  static object Anchor(int line,string scene="start.txt",int occurrence=1,string hash=null){return J.O("scene",scene,"line",line,"occurrence",occurrence,"sourceHash",hash??HashA,"label","Test statement");}
  static object Chain(string script){int count=script.Split('\n').Length;return J.O("scenes",new object[]{J.O("scene","start.txt","hash",HashA,"lines",count)},"originMap",Enumerable.Range(1,count).Select(line=>J.O("scene","start.txt","line",line)).ToArray(),"flattened",new object[0]);}
  static object Parsed(params object[] statements){return J.O("sentenceList",statements);}
  static object Timing(params object[] times){return J.O("lineTimes",times,"durationSeconds",10);}
  static List<object> Candidates(object value){return J.A(J.Get(value,"candidates"));}
  static List<object> Warnings(object value){return J.A(J.Get(value,"warnings"));}
  static object Collect(string script,object parsed,object timing,params object[] selections){return StatementCuts.Collect(script,parsed,timing,Chain(script),selections);}
  public static int Run(){
   checks=0;
   Check(StatementCuts.ValidateSelections(null).Length==0,"Missing selections must be empty");
   Check(StatementCuts.ValidateSelections(new object[0]).Length==0,"Empty selections changed");
   foreach(var supplied in new object[]{"",1,true,J.O("line",1),new object[]{null},new object[]{"bad"}})Reject(()=>StatementCuts.ValidateSelections(supplied),"Malformed selection collection accepted");
   foreach(var scene in new[]{"", "../a.txt","/a.txt","C:\\a.txt","a/../b.txt","a//b.txt","a/./b.txt","a.json","a.txt?x","a\n.txt","a|b.txt"}){
    var anchor=J.D(Anchor(1));anchor["scene"]=scene;Reject(()=>StatementCuts.ValidateSelections(new object[]{anchor}),"Invalid anchor scene accepted: "+scene);
   }
   foreach(var hash in new object[]{null,"",new string('a',63),new string('a',65),new string('x',64),true}){
    var anchor=J.D(Anchor(1));anchor["sourceHash"]=hash;Reject(()=>StatementCuts.ValidateSelections(new object[]{anchor}),"Invalid anchor hash accepted");
   }
   foreach(var invalid in new object[]{0,-1,1.5,double.NaN,double.PositiveInfinity,2147483648d,"1",true,null}){
    var anchor=J.D(Anchor(1));anchor["line"]=invalid;Reject(()=>StatementCuts.ValidateSelections(new object[]{anchor}),"Invalid line accepted");
    anchor=J.D(Anchor(1));anchor["occurrence"]=invalid;Reject(()=>StatementCuts.ValidateSelections(new object[]{anchor}),"Invalid occurrence accepted");
   }
   var badEnd=J.D(Anchor(2));badEnd["endLine"]=1;Reject(()=>StatementCuts.ValidateSelections(new object[]{badEnd}),"Reversed endLine accepted");
   badEnd["endLine"]=2.5;Reject(()=>StatementCuts.ValidateSelections(new object[]{badEnd}),"Fractional endLine accepted");
   var normalization=J.D(Anchor(2," chapter\\start.TXT ",1,HashA.ToUpperInvariant()));normalization.Remove("occurrence");normalization["label"]="  one\n two\t"+new string('z',150);normalization["endLine"]=4;
   string original=J.Text(normalization);var normalized=StatementCuts.ValidateSelections(new object[]{normalization}).Single();
   Check(J.S(normalized,"scene")=="chapter/start.TXT"&&J.S(normalized,"sourceHash")==HashA&&J.N(normalized,"occurrence")==1,"Anchor normalization changed identity");
   Check(J.S(normalized,"label").Length==120&&!J.S(normalized,"label").Contains("\n")&&J.N(normalized,"endLine")==4,"Label or exact boundary normalization failed");
   Check(J.Text(normalization)==original,"Anchor validation mutated the input");
   Check(J.S(StatementCuts.ValidateSelections(new object[]{Anchor(1,"./game/scene/100%.txt")}).Single(),"scene")=="100%.txt","Valid relative scene prefix or literal percent rejected");
   var emojiLabel=J.D(Anchor(1));emojiLabel["label"]=new string('a',119)+"\ud83d\ude00";
   Check(J.S(StatementCuts.ValidateSelections(new object[]{emojiLabel}).Single(),"label").Length==119,"Label truncation split a UTF-16 surrogate pair");

   const string basic="A:first;\nwait:100;\nB:last;";
   var basicParsed=Parsed(Statement(0,"say"),Statement(1,"wait"),Statement(2,"say"));var basicTiming=Timing(0,1000,1100);
   var first=Collect(basic,basicParsed,basicTiming,Anchor(2));
   Check(Candidates(first).Count==1&&J.N(Candidates(first)[0],"atMs")==1000,"Selection did not cut BEFORE selected statement");
   Check(J.N(Candidates(first)[0],"globalLine")==2&&J.N(Candidates(first)[0],"targetLine")==2&&J.S(Candidates(first)[0],"source")=="selection","Selection source provenance lost");
   Check(Candidates(Collect(basic,basicParsed,basicTiming)).Count==0,"No cuts must remain empty for single-part export");
   Check(J.N(Candidates(Collect(basic,basicParsed,basicTiming,Anchor(1)))[0],"atMs")==0,"Output-start cut must reach frame resolver without relocation");
   Reject(()=>Collect(basic,basicParsed,basicTiming,Anchor(2,"missing.txt")),"Scene outside chain accepted");
   Reject(()=>Collect(basic,basicParsed,basicTiming,Anchor(4)),"Out-of-bounds selection accepted");
   Reject(()=>Collect(basic,basicParsed,basicTiming,Anchor(2,"start.txt",1,HashB)),"Stale source hash accepted");
   Reject(()=>Collect(basic,basicParsed,basicTiming,Anchor(2,"start.txt",2)),"Missing occurrence accepted");
   var wrongEnd=J.D(Anchor(2));wrongEnd["endLine"]=3;Reject(()=>Collect(basic,basicParsed,basicTiming,wrongEnd),"Changed statement boundary accepted");

   // The second physical line belongs to the preceding multiline sentence. The
   // parser emits a holder for it, although its raw text looks exactly like a marker.
   const string literals="A:first\\\n;CutHere\n;CutHere\nwait:100;\nA:hello;CutHere\n;CutHere trailing\n;cutHere\n;CutHere";
   var literalParsed=Parsed(Statement(0,"say",1),Statement(1,"comment",1,true),Statement(2,"comment"),Statement(3,"wait"),Statement(4,"say"),Statement(5,"comment"),Statement(6,"comment"),Statement(7,"comment"));
   var literalTiming=Timing(0,null,null,1000,1100,null,null,null);var literalResult=Collect(literals,literalParsed,literalTiming);
   Check(Candidates(literalResult).Count==1,"Literal/multiline/inline/case/trailing-text markers were misclassified");
   Check(J.N(Candidates(literalResult)[0],"line")==3&&J.N(Candidates(literalResult)[0],"targetLine")==4,"Independent marker mapped to wrong statement");
   Check(Warnings(literalResult).Count==1&&J.S(Warnings(literalResult)[0],"code")=="marker-no-target","Trailing marker must be a diagnostic no-op");
   Reject(()=>Collect(literals,literalParsed,literalTiming,Anchor(2)),"Multiline interior selection silently moved");
   Reject(()=>Collect(literals,literalParsed,literalTiming,Anchor(3)),"Comment selection accepted");
   var whole=J.D(Anchor(1));whole["endLine"]=2;
   Check(Candidates(Collect(literals,literalParsed,literalTiming,whole)).Count==2,"Complete multiline selection rejected");
   whole["endLine"]=1;Reject(()=>Collect(literals,literalParsed,literalTiming,whole),"Truncated multiline selection accepted");

   const string consecutive=" \t;CutHere \t\n;CutHere\n; ordinary comment\n\nwait:100;\nA:same-time;";
   var consecutiveParsed=Parsed(Statement(0,"comment"),Statement(1,"comment"),Statement(2,"comment"),Statement(3,"comment"),Statement(4,"wait"),Statement(5,"say"));
   var consecutiveResult=Collect(consecutive,consecutiveParsed,Timing(null,null,null,null,1000,1000),Anchor(5),Anchor(6));
   Check(Candidates(consecutiveResult).Count==4,"Consecutive markers and selected statements must form a union");
   Check(Candidates(consecutiveResult).All(item=>J.N(item,"atMs")==1000),"Same-time candidates were relocated");
   Check(Candidates(consecutiveResult).Count(item=>J.S(item,"source")=="marker")==2,"Duplicate markers lost diagnostic provenance");
   Check(Warnings(consecutiveResult).Count==0,"Interior markers received spurious warnings");

   const string compact="; comment\n\n\nwait:100;";
   var compactResult=Collect(compact,Parsed(Statement(0,"comment"),Statement(3,"wait")),Timing(null,1234.5),Anchor(4));
   Check(J.N(Candidates(compactResult)[0],"atMs")==1234.5,"Timing lookup used physical line instead of parsed sentence index");
   foreach(var invalid in new object[]{null,double.NaN,double.PositiveInfinity,-1,"1000"}){
    Reject(()=>Collect(basic,basicParsed,Timing(0,invalid,1100),Anchor(2)),"Untimed selection silently shifted to later statement");
    const string untimed=";CutHere\nwait:100;\nA:next;";var result=Collect(untimed,Parsed(Statement(0,"comment"),Statement(1,"wait"),Statement(2,"say")),Timing(null,invalid,2000));
    Check(Candidates(result).Count==1&&J.N(Candidates(result)[0],"targetLine")==3&&J.N(Candidates(result)[0],"atMs")==2000,"Marker did not follow the next actually executed statement");
   }

   const string sanitized=";CutHere\nchangeFigure:missing.json\\\n -id=alice;\n;CutHere\nwait:100;\nA:done;";
   var originalParsed=Parsed(Statement(0,"comment"),Statement(1,"changeFigure",2),Statement(2,"comment",2,true),Statement(3,"comment"),Statement(4,"wait"),Statement(5,"say"));
   var sanitizedParsed=Parsed(Statement(0,"comment"),Statement(1,"comment"),Statement(2,"comment"),Statement(3,"comment"),Statement(4,"wait"),Statement(5,"say"));
   var sanitizedTiming=Timing(null,null,null,null,1500,1600);
   var sanitizedResult=StatementCuts.Collect(sanitized,originalParsed,sanitizedTiming,Chain(sanitized),new object[]{Anchor(5)},sanitizedParsed);
   Check(Candidates(sanitizedResult).Count==3&&Candidates(sanitizedResult).All(item=>J.N(item,"atMs")==1500),"Markers must skip a sanitized-away multiline command");
   var removedAnchor=J.D(Anchor(2));removedAnchor["endLine"]=3;
   Reject(()=>StatementCuts.Collect(sanitized,originalParsed,sanitizedTiming,Chain(sanitized),new object[]{removedAnchor},sanitizedParsed),"A sanitized-away explicit selection silently shifted");
   var compactOriginal=Parsed(Statement(0,"comment"),Statement(1,"changeFigure",2),Statement(3,"comment"),Statement(4,"wait"),Statement(5,"say"));
   var compactOriginalResult=StatementCuts.Collect(sanitized,compactOriginal,sanitizedTiming,Chain(sanitized),new object[]{Anchor(5)},sanitizedParsed);
   Check(Candidates(compactOriginalResult).All(item=>J.N(item,"atMs")==1500),"Original parse indexes were used after final parser cardinality changed");
   var compactFinal=Parsed(Statement(0,"comment"),Statement(1,"comment",2),Statement(3,"comment"),Statement(4,"wait"),Statement(5,"say"));
   var compactFinalResult=StatementCuts.Collect(sanitized,originalParsed,Timing(null,null,null,1500,1600),Chain(sanitized),new object[]{Anchor(5)},compactFinal);
   Check(Candidates(compactFinalResult).Count==3&&Candidates(compactFinalResult).All(item=>J.N(item,"atMs")==1500),"Final timing indexes must be mapped by source startLine");
   var exposedMarkerParsed=Parsed(Statement(0,"comment"),Statement(1,"comment"),Statement(2,"comment"),Statement(3,"wait"),Statement(4,"say"),Statement(5,"comment"),Statement(6,"comment"),Statement(7,"comment"));
   var exposedMarkerResult=StatementCuts.Collect(literals,literalParsed,literalTiming,Chain(literals),new object[0],exposedMarkerParsed);
   Check(Candidates(exposedMarkerResult).Count==1&&J.N(Candidates(exposedMarkerResult)[0],"line")==3,"Sanitization turned a multiline literal into a marker");

   const string transferScript="A:start;\n;CutHere\n; WebVideo+ flattened changeScene -> next.txt\n; WebVideo+ unreachable after changeScene\n; heading\nwait:100;\nB:next;";
   var transferParsed=Parsed(Statement(0,"say"),Statement(1,"comment"),Statement(2,"comment"),Statement(3,"comment"),Statement(4,"comment"),Statement(5,"wait"),Statement(6,"say"));
   var transferTiming=Timing(0,null,null,null,null,2000,2100);
   var transferChain=J.O("scenes",new object[]{J.O("scene","start.txt","hash",HashA,"lines",4),J.O("scene","next.txt","hash",HashB,"lines",3)},"originMap",Enumerable.Range(1,4).Select(line=>J.O("scene","start.txt","line",line)).Concat(Enumerable.Range(1,3).Select(line=>J.O("scene","next.txt","line",line))).ToArray(),"flattened",new object[]{J.O("from","start.txt","to","next.txt","line",3,"endLine",3)});
   var transferAnchor=J.D(Anchor(3));transferAnchor["endLine"]=3;
   var transferred=StatementCuts.Collect(transferScript,transferParsed,transferTiming,transferChain,new object[]{transferAnchor,Anchor(3,"next.txt",1,HashB)});
   Check(Candidates(transferred).Count==3,"Scene transition marker/alias/next-scene selection union failed");
   var transition=Candidates(transferred).Single(item=>J.B(item,"flattenedChangeScene"));
   Check(J.S(transition,"scene")=="start.txt"&&J.N(transition,"line")==3&&J.S(transition,"targetScene")=="next.txt"&&J.N(transition,"targetLine")==2&&J.N(transition,"globalLine")==6&&J.N(transition,"atMs")==2000,"Static changeScene alias lost exact source/target identity");
   Check(J.S(Candidates(transferred).Single(item=>J.S(item,"source")=="marker"),"targetScene")=="next.txt","Marker before flattened scene transfer failed to reach successor");
   transferAnchor["endLine"]=4;Reject(()=>StatementCuts.Collect(transferScript,transferParsed,transferTiming,transferChain,new object[]{transferAnchor}),"Changed transition boundary accepted");
   J.D(J.A(J.Get(transferChain,"flattened"))[0])["endLine"]=4;
   Check(Candidates(StatementCuts.Collect(transferScript,transferParsed,transferTiming,transferChain,new object[]{transferAnchor})).Count==2,"Multiline flattened changeScene boundary rejected");

   const string repeated=";CutHere\nwait:100;\nB:middle;\n;CutHere\nwait:100;";
   var repeatedParsed=Parsed(Statement(0,"comment"),Statement(1,"wait"),Statement(2,"say"),Statement(3,"comment"),Statement(4,"wait"));var repeatedTiming=Timing(null,1000,2000,null,3000);
   var repeatedChain=J.O("scenes",new object[]{J.O("scene","a.txt","hash",HashA,"lines",2),J.O("scene","b.txt","hash",HashB,"lines",1),J.O("scene","a.txt","hash",HashA,"lines",2)},"originMap",new object[]{J.O("scene","a.txt","line",1),J.O("scene","a.txt","line",2),J.O("scene","b.txt","line",1),J.O("scene","a.txt","line",1),J.O("scene","a.txt","line",2)},"flattened",new object[0]);
   var repeatedResult=StatementCuts.Collect(repeated,repeatedParsed,repeatedTiming,repeatedChain,new object[]{Anchor(2,"a.txt"),Anchor(2,"a.txt",2)});
   Check(Candidates(repeatedResult).Count==4,"Repeated scene candidates missing");
   Check(Candidates(repeatedResult).Where(item=>J.S(item,"source")=="marker").Select(item=>(int)J.N(item,"occurrence")).SequenceEqual(new[]{1,2}),"Markers must apply to every encountered scene occurrence");
   Check(Candidates(repeatedResult).Where(item=>J.S(item,"source")=="selection").Select(item=>J.N(item,"atMs")).SequenceEqual(new[]{1000d,3000d}),"Temporary selection occurrence mapping changed");
   Reject(()=>StatementCuts.Collect(repeated,repeatedParsed,repeatedTiming,repeatedChain,new object[]{Anchor(2,"a.txt",3)}),"Nonexistent duplicate occurrence accepted");
   J.D(J.A(J.Get(repeatedChain,"scenes"))[2])["hash"]=HashB;
   Check(Candidates(StatementCuts.Collect(repeated,repeatedParsed,repeatedTiming,repeatedChain,new object[]{Anchor(2,"a.txt",2,HashB)})).Count==3,"Occurrence-specific source hash not used");
   Reject(()=>StatementCuts.Collect(repeated,repeatedParsed,repeatedTiming,repeatedChain,new object[]{Anchor(2,"a.txt",2)}),"Stale later occurrence hash accepted");

   const string ended=";CutHere\nend;\n;CutHere\nA:unreachable;";var endedParsed=Parsed(Statement(0,"comment"),Statement(1,"end"),Statement(2,"comment"),Statement(3,"say"));
   var endedResult=Collect(ended,endedParsed,Timing(null,null,null,2000),Anchor(2));
   Check(Candidates(endedResult).Count==0,"Terminal/after-end markers must not produce cuts");
   Check(Warnings(endedResult).Select(item=>J.S(item,"code")).OrderBy(code=>code).SequenceEqual(new[]{"marker-before-end","marker-unreachable","selection-endpoint"}),"Terminal markers and end selection need diagnostic no-ops");
   Reject(()=>Collect(ended,endedParsed,Timing(null,null,null,2000),Anchor(4)),"After-end selection accepted");
   const string empty=";CutHere";Check(Candidates(Collect(empty,Parsed(Statement(0,"comment")),Timing(null))).Count==0,"Marker-only script produced content");

   var unchangedChain=Chain(literals);var unchangedSelections=new object[]{Anchor(4)};string before=J.Text(J.O("parsed",literalParsed,"timing",literalTiming,"chain",unchangedChain,"selections",unchangedSelections));
   StatementCuts.Collect(literals,literalParsed,literalTiming,unchangedChain,unchangedSelections);
   Check(before==J.Text(J.O("parsed",literalParsed,"timing",literalTiming,"chain",unchangedChain,"selections",unchangedSelections)),"Collection mutated parser, timeline, chain, or request anchors");
   return checks;
  }
 }
}
