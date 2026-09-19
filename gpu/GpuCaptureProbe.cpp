#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <windows.graphics.capture.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cwctype>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "windowsapp.lib")
#pragma comment(lib, "user32.lib")
using namespace winrt;
using namespace winrt::Windows::Graphics;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
namespace {
std::string Utf8(const std::wstring& value){if(value.empty())return{};int n=WideCharToMultiByte(CP_UTF8,0,value.data(),(int)value.size(),nullptr,0,nullptr,nullptr);std::string result(n,'\0');WideCharToMultiByte(CP_UTF8,0,value.data(),(int)value.size(),result.data(),n,nullptr,nullptr);return result;}
std::string Json(const std::string& value){std::ostringstream o;o<<'"';for(unsigned char c:value){switch(c){case '\\':o<<"\\\\";break;case '"':o<<"\\\"";break;case '\n':o<<"\\n";break;case '\r':o<<"\\r";break;case '\t':o<<"\\t";break;default:if(c<32)o<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<(int)c<<std::dec;else o<<(char)c;}}o<<'"';return o.str();}
std::wstring Lower(std::wstring value){std::transform(value.begin(),value.end(),value.begin(),[](wchar_t c){return (wchar_t)std::towlower(c);});return value;}
winrt::com_ptr<IDXGIAdapter1> SelectAdapter(std::wstring const& hint,bool& matched){matched=false;winrt::com_ptr<IDXGIFactory1> factory;check_hresult(CreateDXGIFactory1(__uuidof(IDXGIFactory1),factory.put_void()));winrt::com_ptr<IDXGIAdapter1> first;std::wstring needle=Lower(hint);for(UINT i=0;;i++){winrt::com_ptr<IDXGIAdapter1> adapter;if(factory->EnumAdapters1(i,adapter.put())==DXGI_ERROR_NOT_FOUND)break;DXGI_ADAPTER_DESC1 desc{};check_hresult(adapter->GetDesc1(&desc));if(desc.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)continue;if(!first)first=adapter;if(!needle.empty()&&needle.find(Lower(desc.Description))!=std::wstring::npos){matched=true;return adapter;}}return first;}
winrt::com_ptr<ID3D11Device> CreateDevice(std::wstring const& hint,bool& matched){auto adapter=SelectAdapter(hint,matched);winrt::com_ptr<ID3D11Device> device;UINT flags=D3D11_CREATE_DEVICE_BGRA_SUPPORT;HRESULT hr=adapter?D3D11CreateDevice(adapter.get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,flags,nullptr,0,D3D11_SDK_VERSION,device.put(),nullptr,nullptr):D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,flags,nullptr,0,D3D11_SDK_VERSION,device.put(),nullptr,nullptr);if(hr==DXGI_ERROR_UNSUPPORTED)hr=D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_WARP,nullptr,flags,nullptr,0,D3D11_SDK_VERSION,device.put(),nullptr,nullptr);check_hresult(hr);return device;}
IDirect3DDevice WinRtDevice(winrt::com_ptr<ID3D11Device> const& device){auto dxgi=device.as<IDXGIDevice>();winrt::com_ptr<IInspectable> inspectable;check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(),inspectable.put()));return inspectable.as<IDirect3DDevice>();}
GraphicsCaptureItem ItemForWindow(HWND hwnd){auto activation=get_activation_factory<GraphicsCaptureItem>();auto interop=activation.as<IGraphicsCaptureItemInterop>();GraphicsCaptureItem item{nullptr};check_hresult(interop->CreateForWindow(hwnd,guid_of<ABI::Windows::Graphics::Capture::IGraphicsCaptureItem>(),reinterpret_cast<void**>(put_abi(item))));return item;}
std::string AdapterName(winrt::com_ptr<ID3D11Device> const& device){auto dxgi=device.as<IDXGIDevice>();winrt::com_ptr<IDXGIAdapter> adapter;check_hresult(dxgi->GetAdapter(adapter.put()));DXGI_ADAPTER_DESC desc{};check_hresult(adapter->GetDesc(&desc));return Utf8(desc.Description);}
struct Metrics{uint64_t captured=0,valid=0,unique=0,duplicates=0,skipped=0,backward=0;int64_t firstMarker=-1,lastMarker=-1;int width=0,height=0;double markerScale=0;int64_t stampCount=0;double stampSumMs=0,stampMinMs=0,stampMaxMs=0;int64_t lastStamp=0;std::chrono::steady_clock::time_point began=std::chrono::steady_clock::now();std::mutex mutex;};
class Probe{
 HWND hwnd_;bool adapterMatched_=false;winrt::com_ptr<ID3D11Device> device_;winrt::com_ptr<ID3D11DeviceContext> context_;IDirect3DDevice winrtDevice_{nullptr};GraphicsCaptureItem item_{nullptr};Direct3D11CaptureFramePool pool_{nullptr};GraphicsCaptureSession session_{nullptr};event_token token_{};winrt::com_ptr<ID3D11Texture2D> staging_;UINT stagingW_=0,stagingH_=0;Metrics metrics_;std::mutex frameMutex_;
public:
 Probe(HWND hwnd,std::wstring const& adapterHint):hwnd_(hwnd){if(!GraphicsCaptureSession::IsSupported())throw hresult_error(E_NOTIMPL,L"Windows.Graphics.Capture is not supported");device_=CreateDevice(adapterHint,adapterMatched_);device_->GetImmediateContext(context_.put());winrtDevice_=WinRtDevice(device_);item_=ItemForWindow(hwnd_);auto size=item_.Size();pool_=Direct3D11CaptureFramePool::CreateFreeThreaded(winrtDevice_,DirectXPixelFormat::B8G8R8A8UIntNormalized,3,size);session_=pool_.CreateCaptureSession(item_);try{session_.IsCursorCaptureEnabled(false);}catch(...){}token_=pool_.FrameArrived({this,&Probe::OnFrame});session_.StartCapture();}
 ~Probe(){Stop();}
 void Stop(){if(pool_){try{pool_.FrameArrived(token_);}catch(...){}}if(session_){try{session_.Close();}catch(...){}session_=nullptr;}if(pool_){try{pool_.Close();}catch(...){}pool_=nullptr;}}
 std::string Ready(){auto size=item_.Size();std::ostringstream o;o<<"{\"adapter\":"<<Json(AdapterName(device_))<<",\"adapterMatched\":"<<(adapterMatched_?"true":"false")<<",\"width\":"<<size.Width<<",\"height\":"<<size.Height<<",\"dpi\":"<<GetDpiForWindow(hwnd_)<<"}";return o.str();}
 std::string Result(){std::lock_guard<std::mutex> lock(metrics_.mutex);double elapsed=std::chrono::duration<double>(std::chrono::steady_clock::now()-metrics_.began).count();double coverage=metrics_.lastMarker>=metrics_.firstMarker&&metrics_.firstMarker>=0?(double)metrics_.unique/(metrics_.lastMarker-metrics_.firstMarker+1):0;std::ostringstream o;o<<std::fixed<<std::setprecision(4)<<"{\"schemaVersion\":1,\"capturedFrames\":"<<metrics_.captured<<",\"validMarkerFrames\":"<<metrics_.valid<<",\"uniqueMarkers\":"<<metrics_.unique<<",\"duplicateMarkers\":"<<metrics_.duplicates<<",\"skippedMarkers\":"<<metrics_.skipped<<",\"backwardMarkers\":"<<metrics_.backward<<",\"firstMarker\":"<<metrics_.firstMarker<<",\"lastMarker\":"<<metrics_.lastMarker<<",\"markerCoverage\":"<<coverage<<",\"elapsedSeconds\":"<<elapsed<<",\"captureFps\":"<<(elapsed>0?metrics_.captured/elapsed:0)<<",\"uniqueMarkerFps\":"<<(elapsed>0?metrics_.unique/elapsed:0)<<",\"width\":"<<metrics_.width<<",\"height\":"<<metrics_.height<<",\"markerScale\":"<<metrics_.markerScale<<",\"systemIntervalSamples\":"<<metrics_.stampCount<<",\"systemIntervalAvgMs\":"<<(metrics_.stampCount?metrics_.stampSumMs/metrics_.stampCount:0)<<",\"systemIntervalMinMs\":"<<metrics_.stampMinMs<<",\"systemIntervalMaxMs\":"<<metrics_.stampMaxMs<<",\"adapter\":"<<Json(AdapterName(device_))<<"}";return o.str();}
private:
 bool Decode(ID3D11Texture2D* source,D3D11_TEXTURE2D_DESC const& desc,int& marker,double& scaleOut){const UINT wantW=std::min<UINT>(desc.Width,192),wantH=std::min<UINT>(desc.Height,48);if(!staging_||stagingW_!=wantW||stagingH_!=wantH){staging_=nullptr;D3D11_TEXTURE2D_DESC s{};s.Width=wantW;s.Height=wantH;s.MipLevels=1;s.ArraySize=1;s.Format=desc.Format;s.SampleDesc.Count=1;s.Usage=D3D11_USAGE_STAGING;s.CPUAccessFlags=D3D11_CPU_ACCESS_READ;check_hresult(device_->CreateTexture2D(&s,nullptr,staging_.put()));stagingW_=wantW;stagingH_=wantH;}D3D11_BOX box{0,0,0,wantW,wantH,1};context_->CopySubresourceRegion(staging_.get(),0,0,0,0,source,0,&box);D3D11_MAPPED_SUBRESOURCE mapped{};check_hresult(context_->Map(staging_.get(),0,D3D11_MAP_READ,0,&mapped));bool found=false;UINT dpi=GetDpiForWindow(hwnd_);double primary=dpi?dpi/96.0:1.0;std::vector<double> scales={primary,1.0,1.25,1.5,1.75,2.0,2.25,2.5,3.0};for(double scale:scales){uint32_t bits=0;bool fit=true;for(int i=0;i<32;i++){int x=(int)std::lround((i*2+1)*scale),y=(int)std::lround(3*scale);if(x<0||y<0||x>=(int)wantW||y>=(int)wantH){fit=false;break;}auto p=(uint8_t*)mapped.pData+y*mapped.RowPitch+x*4;int light=p[0]+p[1]+p[2];if(light>=384)bits|=(1u<<i);}if(fit&&(bits&0xffu)==0xa5u){marker=(int)((bits>>8)&0xffffffu);scaleOut=scale;found=true;break;}}context_->Unmap(staging_.get(),0);return found;}
 void OnFrame(Direct3D11CaptureFramePool const& sender,winrt::Windows::Foundation::IInspectable const&){std::lock_guard<std::mutex> frameLock(frameMutex_);try{auto frame=sender.TryGetNextFrame();if(!frame)return;auto access=frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();winrt::com_ptr<ID3D11Texture2D> texture;check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D),texture.put_void()));D3D11_TEXTURE2D_DESC desc{};texture->GetDesc(&desc);int marker=-1;double markerScale=0;bool markerOk=Decode(texture.get(),desc,marker,markerScale);auto stamp=frame.SystemRelativeTime();int64_t ticks=stamp.count();std::lock_guard<std::mutex> lock(metrics_.mutex);metrics_.captured++;metrics_.width=(int)desc.Width;metrics_.height=(int)desc.Height;if(ticks&&metrics_.lastStamp){double ms=(ticks-metrics_.lastStamp)/10000.0;metrics_.stampCount++;metrics_.stampSumMs+=ms;if(metrics_.stampCount==1||ms<metrics_.stampMinMs)metrics_.stampMinMs=ms;if(ms>metrics_.stampMaxMs)metrics_.stampMaxMs=ms;}if(ticks)metrics_.lastStamp=ticks;if(markerOk){metrics_.valid++;metrics_.markerScale=markerScale;if(metrics_.firstMarker<0)metrics_.firstMarker=marker;if(metrics_.lastMarker==marker)metrics_.duplicates++;else{metrics_.unique++;if(metrics_.lastMarker>=0){if(marker<metrics_.lastMarker)metrics_.backward++;else if(marker>metrics_.lastMarker+1)metrics_.skipped+=(uint64_t)(marker-metrics_.lastMarker-1);}metrics_.lastMarker=marker;}}}catch(...){}}
};
}
int wmain(int argc,wchar_t** argv){try{winrt::init_apartment(apartment_type::multi_threaded);HWND hwnd=nullptr;std::wstring adapterHint;for(int i=1;i+1<argc;i++){std::wstring key=argv[i];if(key==L"--hwnd")hwnd=(HWND)(uintptr_t)_wcstoui64(argv[++i],nullptr,10);else if(key==L"--adapter-hint")adapterHint=argv[++i];}if(!hwnd||!IsWindow(hwnd))throw std::runtime_error("invalid --hwnd");Probe probe(hwnd,adapterHint);std::cout<<"READY "<<probe.Ready()<<std::endl;std::string line;std::getline(std::cin,line);probe.Stop();std::cout<<"RESULT "<<probe.Result()<<std::endl;return 0;}catch(winrt::hresult_error const& e){std::cerr<<"GPU capture probe failed: 0x"<<std::hex<<(uint32_t)e.code().value<<" "<<Utf8(e.message().c_str())<<std::endl;return 2;}catch(std::exception const& e){std::cerr<<"GPU capture probe failed: "<<e.what()<<std::endl;return 2;}}