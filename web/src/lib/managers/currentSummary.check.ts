// 只测真实读取边界,不连接生产库。
import assert from 'node:assert/strict';
import { getManagerQoQ } from './supabase';
async function main() {
 const oldFetch=globalThis.fetch;
 const oldError=console.error;
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_KEY};
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_KEY='local-test-only';
 let phase:'empty'|'missing'|'failed'='empty';let legacyCalls=0;
 globalThis.fetch=async input=>{
  const u=new URL(input instanceof Request?input.url:String(input));assert.equal(u.origin,'http://127.0.0.1:54321');
  if(u.pathname==='/rest/v1/rpc/current_manager_quarter_summaries') {
   assert.ok(u.searchParams.get('select')?.split(',').includes('verdict'),'保留 PR B 需要的金额判定字段');
   if(phase==='empty')return Response.json([]);
   return Response.json({code:phase==='missing'?'PGRST202':'TEST',message:'expected failure'},{status:phase==='missing'?404:500});
  }
  assert.equal(u.pathname,'/rest/v1/manager_quarter_summary');legacyCalls++;
  return Response.json([{cik:'1',latest_value:100,prior_value:50,latest_count:2,prior_count:1,count_verdict:'buying',verdict:'selling',top_moves:[]}]);
 };
 try {
  assert.equal((await getManagerQoQ()).size,0);assert.equal(legacyCalls,0,'RPC 合法空结果不能回退旧汇总');
  phase='missing';const legacy=await getManagerQoQ();assert.equal(legacy.size,1);assert.equal(legacy.get('1')?.verdict,'selling','金额判定优先于方向相反的只数判定');assert.equal(legacyCalls,1,'迁移前缺 RPC 时兼容旧表');
  phase='failed';console.error=()=>{};assert.equal((await getManagerQoQ()).size,0);assert.equal(legacyCalls,1,'瞬时失败不能伪装成未迁移并返回旧值');
 } finally {
  globalThis.fetch=oldFetch;console.error=oldError;
  for(const [key,value] of [['SUPABASE_URL',env.url],['SUPABASE_SERVICE_KEY',env.key]] as const) {
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
 console.log('currentSummary.check OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
