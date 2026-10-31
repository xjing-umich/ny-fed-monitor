import { getSecUserAgent } from '../sec-client';
const fail=(why:string):never=>{throw new Error(`Official annual source: ${why}`);};
export function trustedOfficialUrl(url:string,origins:string[]):URL{
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||!origins.includes(u.origin))fail('untrusted official URL');
 return u;
}
export async function downloadOfficialBytes(url:string,origins:string[],limit:number):Promise<Uint8Array>{
 let current=trustedOfficialUrl(url,origins);
 for(let redirect=0;redirect<4;redirect++){
  const response=await fetch(current.href,{headers:{'User-Agent':getSecUserAgent()},redirect:'manual',signal:AbortSignal.timeout(60000)});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');if(!location)fail('redirect without location');
   current=trustedOfficialUrl(new URL(location!,current).href,origins);continue;
  }
  if(!response.ok)fail(`HTTP ${response.status}: ${current.href}`);
  if(Number(response.headers.get('content-length')??0)>limit)fail('document exceeds size limit');
  if(!response.body)fail('empty document');
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)fail('document exceeds size limit');chunks.push(value);}}
  finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }
 return fail('too many redirects');
}
