using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;

// Console-only checks of the production parser, policy, native APIs and sockets.
static class ListenerChecks {
 static int passed;
 static void Check(bool value,string name){if(!value)throw new Exception(name);passed++;Console.WriteLine("PASS "+name);}
 static void Reject(Action action,string name){try{action();}catch{Check(true,name);return;}throw new Exception("Accepted "+name);}
 static byte[] Table(int family,string address,int port,int pid,uint state){
  int stride=family==2?24:56;var bytes=new byte[4+stride];BitConverter.GetBytes(1u).CopyTo(bytes,0);
  IPAddress.Parse(address).GetAddressBytes().CopyTo(bytes,4+(family==2?4:0));
  int po=4+(family==2?8:20);bytes[po]=(byte)(port>>8);bytes[po+1]=(byte)port;
  BitConverter.GetBytes(pid).CopyTo(bytes,4+(family==2?20:52));BitConverter.GetBytes(state).CopyTo(bytes,4+(family==2?0:48));return bytes;
 }
 static CraftListenerVerifier.Listener Row(string address,int port,int pid){return new CraftListenerVerifier.Listener{Address=address,Port=port,Pid=pid};}
 static void Policy(){
  var parents=new Dictionary<int,int>{{10,1},{20,10},{30,20},{40,1}};
  foreach(int family in new[]{2,23})foreach(uint state in new uint[]{0,2,6,11}){
   var rows=CraftListenerVerifier.ParseTable(Table(family,family==2?"127.0.0.1":"::1",43210,30,state),family);
   Check(CraftListenerVerifier.Validate(rows,43210,10,parents)==30,"listener-only membership ignores state "+state+" family "+family);
  }
  Check(CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,10),Row("::1",9,10)},9,10,parents)==10,"same owner dual-stack");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("0.0.0.0",9,10)},9,10,parents),"IPv4 wildcard");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("::",9,10)},9,10,parents),"IPv6 wildcard");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("192.0.2.1",9,10)},9,10,parents),"non-loopback");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,40)},9,10,parents),"foreign process");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,0)},9,10,parents),"unknown PID");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,30)},9,99,parents),"missing host");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,99)},9,10,parents),"missing ancestor");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,30),Row("::1",9,20)},9,10,parents),"multiple owners even in host tree");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,30),Row("127.0.0.1",9,30)},9,10,parents),"duplicate listener endpoint");
  Reject(()=>CraftListenerVerifier.Validate(new CraftListenerVerifier.Listener[0],9,10,parents),"no listener");
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,30)},8,10,parents),"wrong port");
  var cycle=new Dictionary<int,int>{{10,1},{20,30},{30,20}};
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,30)},9,10,cycle),"ancestry cycle");
  var deep=new Dictionary<int,int>{{10,1}};for(int i=100;i<125;i++)deep[i]=i+1;deep[125]=10;
  Reject(()=>CraftListenerVerifier.Validate(new[]{Row("127.0.0.1",9,100)},9,10,deep),"ancestry depth limit");
  Reject(()=>CraftListenerVerifier.ParseTable(new byte[3],2),"truncated header");
  Reject(()=>CraftListenerVerifier.ParseTable(new byte[]{1,0,0,0},23),"truncated IPv6 row");
  Reject(()=>CraftListenerVerifier.ParseTable(new byte[]{255,255,255,255},2),"overflowing row count");
  Reject(()=>CraftListenerVerifier.Verify(9,10,f=>{if(f==23)throw new IOException("provider");return Table(2,"127.0.0.1",9,10,0);},()=>parents),"failed second address family");
  Reject(()=>CraftListenerVerifier.Verify(9,10,f=>f==2?Table(2,"127.0.0.1",9,10,0):new byte[4],()=>{throw new IOException("snapshot");}),"failed process snapshot");
 }
 static void NativeErrors(){
  Reject(()=>CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){return 5;}),"native sizing error");
  Reject(()=>CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){size=28;return p==IntPtr.Zero?122u:5u;}),"native read error");
  Reject(()=>CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){size=Int32.MaxValue;return 122;}),"oversized native buffer");
  int calls=0;
  Reject(()=>CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){calls++;size=28;return 122;}),"bounded native size race");
  Check(calls==5,"at most four native read attempts");
  var bytes=Table(2,"127.0.0.1",9,10,0);calls=0;
  var result=CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){
   calls++;Check(kind==3&&family==2&&!order&&reserved==0,"explicit listener-only table query");
   if(p==IntPtr.Zero||calls==2){size=bytes.Length;return 122;}
   Marshal.Copy(bytes,0,p,bytes.Length);size=bytes.Length;return 0;
  });
  Check(result.SequenceEqual(bytes)&&calls==3,"native growth retry succeeds without state rewrite");
  Reject(()=>CraftListenerVerifier.ReadTable(2,delegate(IntPtr p,ref int size,bool order,int family,int kind,uint reserved){if(p==IntPtr.Zero){size=28;return 122;}size=29;return 0;}),"incomplete native buffer");
 }
 static void RealSockets(){
  int pid=Process.GetCurrentProcess().Id;var listener=new TcpListener(IPAddress.Loopback,0);var ipv6=new TcpListener(IPAddress.IPv6Loopback,0);var bound=new Socket(AddressFamily.InterNetwork,SocketType.Stream,ProtocolType.Tcp);
  try{
   listener.Start();ipv6.Start();bound.Bind(new IPEndPoint(IPAddress.Loopback,0));
   int port=((IPEndPoint)listener.LocalEndpoint).Port,v6port=((IPEndPoint)ipv6.LocalEndpoint).Port,boundPort=((IPEndPoint)bound.LocalEndPoint).Port;
   for(int i=0;i<3;i++){
    Check(CraftListenerVerifier.Verify(port,pid)!=null,"real IPv4 listener "+i);
    Check(CraftListenerVerifier.Verify(v6port,pid)!=null,"real IPv6 listener "+i);
    Reject(()=>CraftListenerVerifier.Verify(boundPort,pid),"real bind without listen "+i);
   }
   listener.Stop();ipv6.Stop();Reject(()=>CraftListenerVerifier.Verify(port,pid),"closed IPv4 listener");Reject(()=>CraftListenerVerifier.Verify(v6port,pid),"closed IPv6 listener");
  }finally{listener.Stop();ipv6.Stop();bound.Close();}
 }
 static int Main(){try{Policy();NativeErrors();RealSockets();Console.WriteLine("Listener checks passed: "+passed);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
