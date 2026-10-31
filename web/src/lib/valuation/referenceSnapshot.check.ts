import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://reference-snapshot.invalid';process.env.SUPABASE_SERVICE_KEY='fixture';
const row={ticker:'REF',verdict_bucket:'below',in_strike_zone:false,range_lo:20,range_hi:30,price:18,price_date:'2026-10-30',margin_pct:null,coverage:'single_lamp',reliable:false,computed_at:'2026-10-31',payload:{assessment_status:'valid',referenceOnly:'missing_reinvestment'}};
globalThis.fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input));
 if(u.pathname.endsWith('valuation_snapshot')){
  if(init?.method==='HEAD')return new Response(null,{headers:{'content-range':'*/0'}});
  // Model SQL reliability/strike filters, so a pending reference cannot leak into confirmed cheap views.
  const filtered=u.searchParams.get('reliable')==='eq.true'||u.searchParams.get('in_strike_zone')==='eq.true';
  const select=u.searchParams.get('select')??'';
  return Response.json(filtered?[]:[{...row,...(select.includes('reference_only:')?{reference_only:'missing_reinvestment'}:{})}]);
 }
 if(u.pathname.endsWith('consensus_holdings'))return Response.json([{ticker:'REF',issuer:'Reference company',holder_count:5}]);
 return Response.json([]);
};
async function main(){
 const{readValuationVerdicts,readValuationScreen,readConvictionScreen,readBargainVerdicts}=await import('./valuationSnapshot');
 assert.equal((await readValuationVerdicts(['REF'])).get('REF')?.referenceOnly,'missing_reinvestment');
 assert.equal((await readValuationScreen('all')).rows[0]?.referenceOnly,'missing_reinvestment','all-screen projection retains pending-reference provenance');
 assert.equal((await readConvictionScreen()).rows[0]?.referenceOnly,'missing_reinvestment','conviction projection retains pending-reference provenance');
 assert.equal((await readValuationScreen('below')).rows.length,0);
 assert.equal((await readValuationScreen('strike_zone')).rows.length,0);
 assert.equal((await readBargainVerdicts()).size,0);
 console.log('pending zero-growth snapshot projection and confirmed-signal exclusion checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
