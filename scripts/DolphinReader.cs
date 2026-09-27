// Read-only telemetry for Melee USA 1.02. Addresses cross-referenced with
// bkacjios/m-target source/modules/games/GALE01-2.lua (see docs/website.md).
using System;
using System.Runtime.InteropServices;

public sealed class DolphinReader : IDisposable {
    [StructLayout(LayoutKind.Sequential)]
    struct Region {
        public IntPtr BaseAddress, AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State, Protect, Type;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr length, out UIntPtr read);
    [DllImport("kernel32.dll")]
    static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out Region region, UIntPtr length);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr process;
    long ram;
    public DolphinReader(int processId) {
        process = OpenProcess(0x0400 | 0x0010, false, processId); // query + read; no writes
        if (process == IntPtr.Zero) throw new InvalidOperationException("Cannot read Dolphin");
        try { ram = FindRam(); } catch { Dispose(); throw; }
    }
    byte[] Read(long address, int count) {
        byte[] bytes = new byte[count]; UIntPtr read;
        if (!ReadProcessMemory(process, new IntPtr(address), bytes, new UIntPtr((uint)count), out read) || read.ToUInt64() != (ulong)count)
            throw new InvalidOperationException("RAM not available");
        return bytes;
    }
    static uint U32(byte[] b, int i) { return ((uint)b[i]<<24) | ((uint)b[i+1]<<16) | ((uint)b[i+2]<<8) | b[i+3]; }
    static int U16(byte[] b, int i) { return (b[i]<<8) | b[i+1]; }
    long FindRam() {
        long address = 0; Region region;
        while (VirtualQueryEx(process, new IntPtr(address), out region, new UIntPtr((uint)Marshal.SizeOf(typeof(Region)))).ToUInt64() != 0) {
            long start = region.BaseAddress.ToInt64(); ulong size = region.RegionSize.ToUInt64();
            if (region.State == 0x1000 && region.Type == 0x40000 && size >= 0x1800000 && (region.Protect & 0x101) == 0) {
                try {
                    byte[] h = Read(start, 8);
                    if (h[0]==71 && h[1]==65 && h[2]==76 && h[3]==69 && h[4]==48 && h[5]==49 && h[6]==0 && h[7]==2) return start;
                } catch { }
            }
            if (size > long.MaxValue || start + (long)size <= address) break;
            address = start + (long)size;
        }
        throw new InvalidOperationException("Melee RAM not found");
    }
    public string Sample(int pid) {
        for (int attempt=0; attempt<4; attempt++) {
            byte[] scene = Read(ram+0x479D30, 0x34);
            byte[] match = Read(ram+0x46B6A0, 0x30);
            byte[] stage = Read(ram+0x49E6C8, 0x6D6);
            byte[] character = Read(ram+0x453084, 4);
            uint frame = U32(scene,0x30);
            if (frame != U32(Read(ram+0x479D60,4),0)) continue;
            return String.Format(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"status\":\"connected\",\"pid\":{0},\"major\":{1},\"minor\":{2},\"frame\":{3},\"characterId\":{4},\"stageId\":{5},\"remaining\":{6},\"result\":{7},\"seconds\":{8},\"timerFrame\":{9}}}",
                // +0x24 is the total frame counter; +0x26 would read its low half.
                // +0x2C is the fractional timer frame (0..59).
                pid,scene[0],scene[3],frame,U32(character,0),U32(stage,0x88),U16(stage,0x6D4),match[8],U32(match,0x28),U16(match,0x2C));
        }
        return null;
    }
    public void Dispose() { if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; } }
}
