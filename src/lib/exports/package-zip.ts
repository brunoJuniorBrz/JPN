/** ZIP STORE, UTF-8 filenames, CRC32, no platform-specific archive service. */
export function createPackageZip(files:{name:string;bytes:Uint8Array}[]):Uint8Array<ArrayBuffer>{
  const encoder=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  const crc=(bytes:Uint8Array)=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  function header(size:number){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
  for(const file of files){
    if(!file.name||file.name.startsWith("/")||file.name.split("/").includes(".."))throw Error("Nome inválido no ZIP.");
    const name=encoder.encode(file.name),checksum=crc(file.bytes),local=header(30),entry=header(46),length=file.bytes.length;
    local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint16(12,33,true);
    local.view.setUint32(14,checksum,true);local.view.setUint32(18,length,true);local.view.setUint32(22,length,true);local.view.setUint16(26,name.length,true);
    entry.view.setUint32(0,0x02014b50,true);entry.view.setUint16(4,20,true);entry.view.setUint16(6,20,true);entry.view.setUint16(8,0x800,true);entry.view.setUint16(14,33,true);
    entry.view.setUint32(16,checksum,true);entry.view.setUint32(20,length,true);entry.view.setUint32(24,length,true);entry.view.setUint16(28,name.length,true);entry.view.setUint32(42,offset,true);
    parts.push(local.bytes,name,file.bytes);central.push(entry.bytes,name);offset+=30+name.length+length;
  }
  const centralSize=central.reduce((s,b)=>s+b.length,0),end=header(22);
  end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  const out=new Uint8Array(offset+centralSize+22);let at=0;for(const p of [...parts,...central,end.bytes]){out.set(p,at);at+=p.length;}return out;
}
