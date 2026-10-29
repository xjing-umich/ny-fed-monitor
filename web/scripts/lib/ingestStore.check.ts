import assert from 'node:assert/strict';
import { storeBeforeDeriving, ManagerWriteError, needsSiteRefresh } from './ingestStore';
import { publishManagerDerived } from './splitStore';
async function main() {
 const items=['a','b','c'].map(slug=>({manager:{slug}}));
 let derived=0;
 let wrote=0;
 await assert.rejects(storeBeforeDeriving(items,async d=>{if(d.manager.slug==='b')throw new Error('insert failure');wrote++;},async()=>{derived++;return{derivedChanged:true};}), (e:unknown)=>e instanceof ManagerWriteError&&e.written===2);
 assert.equal(wrote,2);assert.equal(derived,0,'落库失败不能用半套来源生成派生结果');
 const success=await storeBeforeDeriving(items,async()=>{},async()=>({derivedChanged:true}));
 assert.deepEqual(success,{written:3,result:{derivedChanged:true}});
 assert.equal(needsSiteRefresh([],true),true,'无新 accession 但派生变化必须刷新');
 assert.equal(needsSiteRefresh([],false),false,'只有 computed_at 改变不能刷新');
 assert.equal(needsSiteRefresh(['new'],false),true);
 assert.equal(needsSiteRefresh(null,false),true,'新 accession 检查失败保守刷新');
 let calls=0;
 const db={rpc:async(name:string,args:unknown)=>{assert.equal(name,'publish_manager_derived');assert.ok(args);calls++;return{data:false,error:null};}};
 assert.equal(await publishManagerDerived(db,[],[],'2026-10-29T00:00:00Z'),false);
 assert.equal(calls,1,'两表只调用一次原子发布 RPC');
 await assert.rejects(publishManagerDerived({rpc:async()=>({data:null,error:{code:'PGRST202',message:'missing RPC'}})},[],[],'2026-10-29T00:00:00Z'),/migration|迁移/,'RPC 未迁移不能回退不安全双写');
 await assert.rejects(publishManagerDerived({rpc:async()=>({data:null,error:null})},[],[],'2026-10-29T00:00:00Z'),/invalid|无效/);
 console.log('ingestStore.check OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
