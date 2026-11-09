// Disposable hosted-CI diagnosis only. Simulates DACL checks on the existing
// station/desktop; never opens another desktop, changes an ACL, or impersonates.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

static class CiHostAccess {
    [StructLayout(LayoutKind.Sequential)] struct Mapping { public uint Read, Write, Execute, All; }
    [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool GetUserObjectInformation(IntPtr handle, int index, IntPtr data, int size, out int required);
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool GetUserObjectSecurity(IntPtr handle, ref uint information, byte[] data, uint size, out uint required);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool DuplicateTokenEx(IntPtr source, uint access, IntPtr attributes, int level, int type, out IntPtr result);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool AccessCheck(byte[] descriptor, IntPtr token, uint desired, ref Mapping mapping,
        IntPtr privileges, ref uint privilegeSize, out uint granted, out bool status);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static byte[] Security(IntPtr handle, uint information) {
        uint size;
        GetUserObjectSecurity(handle, ref information, null, 0, out size);
        if (size < 20 || size > 65536) throw new Win32Exception(Marshal.GetLastWin32Error());
        var bytes = new byte[size];
        if (!GetUserObjectSecurity(handle, ref information, bytes, size, out size)) throw new Win32Exception(Marshal.GetLastWin32Error());
        return bytes;
    }
    static string Name(IntPtr handle) {
        int size;
        GetUserObjectInformation(handle, 2, IntPtr.Zero, 0, out size); // UOI_NAME
        if (size < 2 || size > 2048) throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr data = Marshal.AllocHGlobal(size);
        try {
            if (!GetUserObjectInformation(handle, 2, data, size, out size)) throw new Win32Exception(Marshal.GetLastWin32Error());
            return Marshal.PtrToStringUni(data);
        } finally { Marshal.FreeHGlobal(data); }
    }
    internal static Dictionary<string,object> Label(byte[] descriptor) {
        var result = new Dictionary<string,object>{{"read",true},{"present",false}};
        var sacl = new RawSecurityDescriptor(descriptor, 0).SystemAcl;
        if (sacl != null) foreach (GenericAce ace in sacl) {
            if ((int)ace.AceType != 17) continue; // SYSTEM_MANDATORY_LABEL_ACE
            var bytes = new byte[ace.BinaryLength]; ace.GetBinaryForm(bytes, 0);
            if (bytes.Length < 20) throw new InvalidOperationException("Invalid mandatory label");
            var sid = new SecurityIdentifier(bytes, 8);
            var parts = sid.Value.Split('-');
            if (parts.Length != 4 || parts[0] != "S" || parts[1] != "1" || parts[2] != "16") throw new InvalidOperationException("Unexpected mandatory label");
            result["present"] = true; result["integrityRid"] = UInt32.Parse(parts[3]);
            result["policyMask"] = BitConverter.ToUInt32(bytes, 4); return result;
        }
        return result;
    }
    static Dictionary<string,object> Failure(Exception error) {
        var result = new Dictionary<string,object>{{"read",false},{"errorType",error.GetType().Name}};
        var native = error as Win32Exception; if (native != null) result["win32Code"] = native.NativeErrorCode;
        return result; // No error message, SID, ACL or object name.
    }
    static object Check(byte[] descriptor, IntPtr primary, Mapping mapping) {
        IntPtr impersonation = IntPtr.Zero, privileges = IntPtr.Zero;
        try {
            // SecurityImpersonation=2, TokenImpersonation=2; QUERY only on copy.
            // The copy is supplied to AccessCheck, never applied to a thread.
            if (!DuplicateTokenEx(primary, 8, IntPtr.Zero, 2, 2, out impersonation)) throw new Win32Exception(Marshal.GetLastWin32Error());
            uint size = 8192, granted; bool status;
            privileges = Marshal.AllocHGlobal((int)size);
            bool api = AccessCheck(descriptor, impersonation, 0x02000000, ref mapping, privileges, ref size, out granted, out status);
            int error = api ? 0 : Marshal.GetLastWin32Error();
            return new Dictionary<string,object>{{"apiSucceeded",api},{"accessStatus",api && status},{"grantedMask",api ? granted : 0},{"win32Code",error}};
        } catch (Exception error) { return Failure(error); }
        finally { if (privileges != IntPtr.Zero) Marshal.FreeHGlobal(privileges); if (impersonation != IntPtr.Zero) CloseHandle(impersonation); }
    }
    static object ObjectSummary(IntPtr handle, string expected, bool station, IntPtr source, IntPtr reduced) {
        var result = new Dictionary<string,object>{{"kind",station ? "window-station" : "desktop"}};
        if (handle == IntPtr.Zero) { result["handleAvailable"] = false; return result; }
        result["handleAvailable"] = true;
        try { result["standardName"] = String.Equals(Name(handle), expected, StringComparison.OrdinalIgnoreCase); }
        catch (Exception error) { result["nameQuery"] = Failure(error); }
        try {
            // OWNER|GROUP|DACL only. MAXIMUM_ALLOWED is a simulated DACL query,
            // not a request to open the object or grant any access to it.
            var descriptor = Security(handle, 7);
            var mapping = station ? new Mapping{Read=0x20303,Write=0x2001c,Execute=0x20060,All=0xf037f}
                                  : new Mapping{Read=0x20041,Write=0x200be,Execute=0x20100,All=0xf01ff};
            result["daclRead"] = true; result["sourceDacl"] = Check(descriptor, source, mapping); result["reducedDacl"] = Check(descriptor, reduced, mapping);
        } catch (Exception error) { result["daclQuery"] = Failure(error); }
        try { result["mandatoryLabel"] = Label(Security(handle, 16)); } // LABEL only, no audit SACL or privilege adjustment.
        catch (Exception error) { result["mandatoryLabel"] = Failure(error); }
        return result;
    }
    internal static object Summary(IntPtr source, IntPtr reduced) {
        return new Dictionary<string,object>{
            {"scope","Read-only current objects; DACL simulation excludes MIC and is not a launch guarantee"},
            {"station",ObjectSummary(GetProcessWindowStation(),"WinSta0",true,source,reduced)},
            {"desktop",ObjectSummary(GetThreadDesktop(GetCurrentThreadId()),"Default",false,source,reduced)}
        }; // Returned user32 object handles are borrowed and must not be closed.
    }
}
