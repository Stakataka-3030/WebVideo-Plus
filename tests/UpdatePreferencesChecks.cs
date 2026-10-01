using System;
using System.Collections.Generic;
using NativeVideo;

class UpdatePreferencesChecks {
 static Dictionary<string,object> Choice(string mode,string baseline){return new Dictionary<string,object>{{"mode",mode},{"baselineVersion",baseline}};}
 static void Equal(bool actual,bool expected){if(actual!=expected)throw new Exception("更新提醒阈值检查失败");}
 static void Main(){
  Equal(UpdatePreferences.Suppressed(Choice("on",""),"1.1.4"),false);
  Equal(UpdatePreferences.Suppressed(Choice("never",""),"2.0.0"),true);
  Equal(UpdatePreferences.Suppressed(Choice("next-release","1.1.4"),"1.1.4"),true);
  Equal(UpdatePreferences.Suppressed(Choice("next-release","1.1.4"),"1.1.5"),false);
  Equal(UpdatePreferences.Suppressed(Choice("next-major","1.1.4"),"1.9.9"),true);
  Equal(UpdatePreferences.Suppressed(Choice("next-major","1.1.4"),"2.0.0"),false);
  Console.WriteLine("Installer update suppression checks passed.");
 }
}
