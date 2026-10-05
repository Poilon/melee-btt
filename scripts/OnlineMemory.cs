// Narrow write bridge for the TTRC menu mailbox. Never writes gameplay/code memory.
using System;
using System.Runtime.InteropServices;
public sealed class OnlineMemory : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Region {public IntPtr BaseAddress,AllocationBase;public uint AllocationProtect;public UIntPtr RegionSize;public uint State,Protect,Type;}
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint a,bool b,int p);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadProcessMemory(IntPtr p,IntPtr a,byte[] b,UIntPtr n,out UIntPtr read);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr p,IntPtr a,byte[] b,UIntPtr n,out UIntPtr written);
 [DllImport("kernel32.dll")]static extern UIntPtr VirtualQueryEx(IntPtr p,IntPtr a,out Region r,UIntPtr n);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 public static System.Threading.Tasks.Task<string> NextInput(){return System.Threading.Tasks.Task.Factory.StartNew(()=>Console.ReadLine());}
 IntPtr process;long ram;uint state;
 static uint Word(byte[] b,int o){return ((uint)b[o]<<24)|((uint)b[o+1]<<16)|((uint)b[o+2]<<8)|b[o+3];}
 byte[] ReadRaw(long address,int count){byte[] b=new byte[count];UIntPtr n;if(!ReadProcessMemory(process,new IntPtr(address),b,new UIntPtr((uint)count),out n)||n.ToUInt32()!=count)throw new Exception("Read failed");return b;}
 byte[] Read(uint address,int count){if(address<0x80000000L||(long)address+count>0x81800000L)throw new Exception("Outside RAM");return ReadRaw(ram+address-0x80000000L,count);}
 uint U(uint a){return Word(Read(a,4),0);}
 public OnlineMemory(int pid){
  process=OpenProcess(0x438,false,pid);if(process==IntPtr.Zero)throw new Exception("Cannot access TTRC Dolphin");
  try{long address=0;Region region;while(VirtualQueryEx(process,new IntPtr(address),out region,new UIntPtr((uint)Marshal.SizeOf(typeof(Region)))).ToUInt64()!=0){
   long start=region.BaseAddress.ToInt64();ulong size=region.RegionSize.ToUInt64();
   if(region.State==0x1000&&region.Type==0x40000&&size>=0x1800000&&(region.Protect&0x101)==0){try{var h=ReadRaw(start,8);if(Word(h,0)==0x47414c45&&Word(h,4)==0x30310002){ram=start;return;}}catch{}}
   if(size>long.MaxValue||start+(long)size<=address)break;address=start+(long)size;
  }throw new Exception("Game not loaded");}catch{Dispose();throw;}
 }
 uint Locate(){
  var scene=Read(0x80479D30,4);if(scene[0]!=1||scene[3]!=0||Read(0x804A04F0,1)[0]!=9)return 0;
  uint archive=U(0x804D6BB8);if(archive<0x804e0000||archive>0x817fffb0)return 0;
  uint roots=U(archive+12),data=U(archive+32),table=U(archive+40);if(roots<1||roots>1000)return 0;
  uint p=data+U(table+(roots-1)*8);if(p<0x804e0000||p>0x817ffc00)return 0;
  if(U(p)!=0x5454524f||U(p+4)!=1||U(p+20)==0)return 0;return p;
 }
 public string Snapshot(){state=Locate();return state==0?null:state.ToString()+":"+Convert.ToBase64String(Read(state,860));}
 void Write(uint a,byte[] b){UIntPtr n;if(!WriteProcessMemory(process,new IntPtr(ram+a-0x80000000L),b,new UIntPtr((uint)b.Length),out n)||n.ToUInt32()!=b.Length)throw new Exception("Mailbox write failed");}
 static byte[] Bytes(uint v){return new byte[]{(byte)(v>>24),(byte)(v>>16),(byte)(v>>8),(byte)v};}
 public bool Reply(uint address,uint sequence,string base64){
  // A scene transition or a new request invalidates an in-flight response.
  uint p=Locate();if(p==0||p!=address||U(p+64)!=sequence)return false;
  byte[] bytes=Convert.FromBase64String(base64);if(bytes.Length!=596)return false;
  Write(p+260,bytes);Write(p+256,Bytes(sequence));return true;
 }
 public void Heartbeat(uint tick){uint p=Locate();if(p!=0)Write(p+856,Bytes(tick));}
 public void Dispose(){if(process!=IntPtr.Zero){CloseHandle(process);process=IntPtr.Zero;}}
}
