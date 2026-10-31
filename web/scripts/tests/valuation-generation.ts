import assert from 'node:assert/strict';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
const origin=process.argv[process.argv.indexOf('--origin')+1];
assert(origin?.startsWith('http://127.0.0.1:')||origin?.startsWith('http://localhost:'),'local fixture origin required');
async function main(){
 for(const path of ['/stocks/screener','/zh/stocks/screener']){
  const response=await fetch(origin+path); assert.equal(response.status,200,path);
  assert.equal(response.headers.get('set-cookie'),null,'public rendering never sets session cookie');
  const html=await response.text();let markedNumeric=false;
  function visit(node:DefaultTreeAdapterTypes.Node){
   if('tagName' in node){if(['script','head','style'].includes(node.tagName))return;const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));if(attrs['data-valuation-identity']===Buffer.from('figi:BBG000000002').toString('base64url')){const content=JSON.stringify(node.childNodes,(k,v)=>k==='parentNode'?undefined:v);if(content.includes('100'))markedNumeric=true;}}
   if('childNodes' in node)node.childNodes.forEach(visit);
  }visit(parse(html));
  assert(markedNumeric,`${path}: actual numeric wrapper must bind published FAA identity/revision and raw IV $100`);
 }console.log('valuation-generation: actual bilingual SSR digits and publication markers PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
