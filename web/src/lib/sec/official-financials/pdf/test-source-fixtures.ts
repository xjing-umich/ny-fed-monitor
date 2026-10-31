import fs from 'node:fs';
export const fixtureJson=(name:string)=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
export const fixturePdf=(ticker:string)=>new Uint8Array(fs.readFileSync(new URL('./fixtures/'+ticker.toLowerCase()+'-original-pages.pdf',import.meta.url)));
export function pdfSourceResponse(u:URL):Response|null{
 if(u.hostname==='securitiesfilings.fdicconnect.fdic.gov'){
  if(u.pathname.endsWith('/cert/110')){
   const rows=fixtureJson('fdic-index.json');const r=rows.find((r:{instFlngId:number})=>r.instFlngId===11868);r.instFlngAtchList[0].instFlngAtchSizeQty=fixturePdf('OZK').length;return Response.json(rows);
  }
  if(u.pathname==='/api/instflng/11868/attachment/1')return new Response(fixturePdf('OZK'));
  throw Error('unexpected FDIC URL '+u.href);
 }
 if(u.hostname==='www.tourmalineoil.com'){
  const d=fixtureJson('tourmaline-index.json');const r=d.props.pageProps.sliceContext.documentFeeds['Financial Reports'].find((r:{id:string})=>r.id==='aaidFBoAAEgAt0Ao');r.data.link.size=String(fixturePdf('TRMLF').length);
  return new Response('<script id="__NEXT_DATA__">'+JSON.stringify(d)+'</script>');
 }
 if(u.hostname==='tourmaline.cdn.prismic.io')return new Response(fixturePdf('TRMLF'));
 return null;
}
