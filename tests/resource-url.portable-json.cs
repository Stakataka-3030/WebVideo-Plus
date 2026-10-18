// Test-only serializer bridge for PowerShell 7/.NET on non-Windows.
// Adapter, J, Files and TerreUserData are compiled from production source.
// This does not simulate WebView2 or replace the real product-assembly Windows test.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
namespace System.Web.Script.Serialization {
 public sealed class JavaScriptSerializer {
  public int MaxJsonLength {get;set;}
  public int RecursionLimit {get;set;}
  public object DeserializeObject(string text){using(var document=JsonDocument.Parse(text))return ConvertElement(document.RootElement);}
  static object ConvertElement(JsonElement value){
   switch(value.ValueKind){
    case JsonValueKind.Object:return value.EnumerateObject().ToDictionary(p=>p.Name,p=>ConvertElement(p.Value));
    case JsonValueKind.Array:return value.EnumerateArray().Select(ConvertElement).ToArray();
    case JsonValueKind.String:return value.GetString();
    case JsonValueKind.Number:return value.GetDouble();
    case JsonValueKind.True:return true;
    case JsonValueKind.False:return false;
    default:return null;
   }
  }
  public string Serialize(object value){return JsonSerializer.Serialize(value);}
 }
}
