import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getOfficialSourceRoute } from "./registry";
import type { AnnualSourcePeriod } from "./types";

const XBRL="http://www.xbrl.org/2003/instance", IX="http://www.xbrl.org/2013/inlineXBRL";
const IFRS=/^https:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/;
const TRANSFORMS="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16";
type RecordNode=Record<string,unknown>;
type Element={name:string;uri:string;scope:Record<string,string>;attrs:Record<string,string>;children:RecordNode[]};
const qname=(name:string,scope:Record<string,string>)=>({name:name.split(':').at(-1)!,uri:scope[name.includes(':')?name.split(':')[0]:""]??""});
function elements(records:RecordNode[],scope:Record<string,string>):Element[]{
 return records.flatMap(record=>{
  const tag=Object.keys(record).find(key=>key!==':@'&&!key.startsWith('#')&&!key.startsWith('?'));
  if(!tag)return[];
  const attrs=(record[':@']??{}) as Record<string,string>;let local=scope;
  for(const [key,value]of Object.entries(attrs)){
   if(key==='@_xmlns'||key.startsWith('@_xmlns:')){
    if(local===scope)local={...scope};
    local[key==='@_xmlns'?'':key.slice(8)]=value;
   }
  }
  return [{...qname(tag,local),scope:local,attrs,children:Array.isArray(record[tag])?record[tag] as RecordNode[]:[]}];
 });
}
function text(records:RecordNode[]):string{
 return records.map(record=>typeof record['#text']==='string'?record['#text']:Object.entries(record).filter(([k,v])=>k!==':@'&&Array.isArray(v)).map(([,v])=>text(v as RecordNode[])).join('')).join('');
}
const children=(node:Element,name:string)=>elements(node.children,node.scope).filter(child=>child.uri===XBRL&&child.name===name);
const one=(node:Element,name:string)=>children(node,name)[0];
const fail=(reason:string):never=>{throw new Error(`Official inline annual: ${reason}`);};
const day=(s:string)=>Date.parse(s+'T00:00:00Z')/86400000;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(day(s))&&new Date(day(s)*86400000).toISOString().slice(0,10)===s;
const FIELDS:Record<string,{metric:string;instant?:boolean;unit?:'shares'|'eps'}>={
 Revenue:{metric:'revenue'},RevenueFromContractsWithCustomers:{metric:'revenue'},
 ProfitLoss:{metric:'profit_loss'},ProfitLossAttributableToOwnersOfParent:{metric:'profit_loss_attributable_to_owners'},
 GrossProfit:{metric:'gross_profit'},ProfitLossFromOperatingActivities:{metric:'operating_profit'},
 CashAndCashEquivalents:{metric:'cash_and_equivalents',instant:true},Assets:{metric:'total_assets',instant:true},
 Liabilities:{metric:'total_liabilities',instant:true},Equity:{metric:'equity',instant:true},
 EquityAttributableToOwnersOfParent:{metric:'equity_attributable_to_owners',instant:true},
 CashFlowsFromUsedInOperatingActivities:{metric:'operating_cash_flow'},
 PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities:{metric:'purchases_of_ppe'},
 BasicEarningsLossPerShare:{metric:'basic_eps',unit:'eps'},DilutedEarningsLossPerShare:{metric:'diluted_eps',unit:'eps'},
 WeightedAverageShares:{metric:'weighted_average_shares',unit:'shares'},AdjustedWeightedAverageShares:{metric:'diluted_weighted_average_shares',unit:'shares'},
};
function numberValue(raw:string,format:string|undefined,scope:Record<string,string>):number{
 let value=raw.trim().replace(/[\s\u00a0\u202f]/g,'');
 if(format){
  const transform=qname(format,scope);
  if(transform.uri!==TRANSFORMS)fail('unsupported numeric transformation namespace');
  if(transform.name==='fixed-zero')return 0;
  if(transform.name==='num-comma-decimal'){
   if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(value))fail('invalid comma-decimal fact');
   value=value.replaceAll('.','').replace(',','.');
  }else if(transform.name==='num-dot-decimal'){
   if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value))fail('invalid dot-decimal fact');
   value=value.replaceAll(',','');
  }else fail('unsupported numeric transformation');
 }
 if(!/^\d+(?:\.\d+)?$/.test(value))fail('invalid numeric fact');
 const n=Number(value);if(!Number.isFinite(n))fail('non-finite numeric fact');return n;
}

/** Namespace-aware inline facts; only issuer-wide annual contexts and original currency are inputs. */
export function parseOfficialInlineAnnual(ticker:string,xml:string,reportEnd:string):AnnualSourcePeriod[]{
 const cik=ticker==='HMRZF'?'0001396282':ticker==='HKHHF'?'0001142231':'';
 const route=getOfficialSourceRoute(ticker,cik);
 if(!route||!['esef_zip','inline_viewer'].includes(route.adapter)||!date(reportEnd)
   ||!reportEnd.endsWith(ticker==='HMRZF'?'-11-30':'-12-31'))fail('issuer or fiscal year identity');
 if(xml.length>48_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)fail('invalid or oversized XML');
 const retained=new Set(['id','name','contextRef','unitRef','scale','sign','format','scheme','continuedAt','target','tupleRef']);
 const records=new XMLParser({preserveOrder:true,ignoreAttributes:(name:string)=>!retained.has(name)&&!name.startsWith('xmlns')&&!name.endsWith(':nil'),parseTagValue:false,trimValues:false,processEntities:false}).parse(xml) as RecordNode[];
 const contexts=new Map<string,{start?:string;end:string;instant:boolean}>(),units=new Map<string,string>();
 const facts:Element[]=[];
 const contextIds=new Set<string>(),unitIds=new Set<string>(),unsupportedUnits=new Set<string>();
 const walk=(nodes:RecordNode[],scope:Record<string,string>)=>{
  for(const node of elements(nodes,scope)){
   if(node.uri===XBRL&&node.name==='context'){
    const id=node.attrs['@_id'];if(!id||contextIds.has(id))fail('missing or duplicate context ID');contextIds.add(id);
    const entity=one(node,'entity'),period=one(node,'period');
    const identifier=entity&&one(entity,'identifier');
    if(identifier&&period&&identifier.attrs['@_scheme']==='http://standards.iso.org/iso/17442'
      &&text(identifier.children).trim()===route!.issuer_identifier&&!one(entity!,'segment')&&!one(node,'scenario')){
     const instant=one(period,'instant'),startNode=one(period,'startDate'),endNode=one(period,'endDate');
     const end=text((instant??endNode)?.children??[]).trim(),start=startNode?text(startNode.children).trim():undefined;
     if(date(end)&&end<=reportEnd&&day(reportEnd)-day(end)<=380&&(instant||(start&&date(start)&&day(end)-day(start)>=350&&day(end)-day(start)<=380)))
      contexts.set(node.attrs['@_id'],{start,end,instant:!!instant});
    }
   }else if(node.uri===XBRL&&node.name==='unit'){
    const id=node.attrs['@_id'];if(!id||unitIds.has(id))fail('missing or duplicate unit ID');unitIds.add(id);
    const parts=elements(node.children,node.scope),measures=children(node,'measure');
    if(parts.length===1&&measures.length===1){
     const measure=measures[0];
     const q=qname(text(measure.children).trim(),measure.scope);
     if(q.uri==='http://www.xbrl.org/2003/iso4217'&&q.name===route!.currency)units.set(node.attrs['@_id'],route!.currency);
     if(q.uri===XBRL&&q.name==='shares')units.set(node.attrs['@_id'],'shares');
    }else{
     const divides=children(node,'divide'),divide=divides[0],num=divide&&one(divide,'unitNumerator'),den=divide&&one(divide,'unitDenominator');
     if(parts.length!==1||divides.length!==1||elements(divide.children,divide.scope).length!==2||!num||!den
       ||elements(num.children,num.scope).length!==1||elements(den.children,den.scope).length!==1
       ||children(num,'measure').length!==1||children(den,'measure').length!==1){unsupportedUnits.add(id);continue;}
     const nm=one(num,'measure'),dm=one(den,'measure');
     if(nm&&dm){const n=qname(text(nm.children).trim(),nm.scope),d=qname(text(dm.children).trim(),dm.scope);
      if(n.uri==='http://www.xbrl.org/2003/iso4217'&&n.name===route!.currency&&d.uri===XBRL&&d.name==='shares')units.set(node.attrs['@_id'],route!.currency+'/shares');}
    }
   }else if(node.uri===IX&&node.name==='nonFraction')facts.push(node);
   if(!(node.name==='script'||node.name==='style'))walk(node.children,node.scope);
  }
 };
 walk(records,{});
 const unsupportedContent=(nodes:RecordNode[],scope:Record<string,string>):boolean=>elements(nodes,scope).some(node=>
  (node.uri===IX&&node.name==='exclude')||unsupportedContent(node.children,node.scope));
 const periods=new Map<string,AnnualSourcePeriod>();
 for(const fact of facts){
  const concept=qname(fact.attrs['@_name']??'',fact.scope),field=FIELDS[concept.name];
  if(!field||!IFRS.test(concept.uri))continue;
  if(field.metric==='revenue'&&concept.name!==(ticker==='HMRZF'?'RevenueFromContractsWithCustomers':'Revenue'))continue;
  const ctx=contexts.get(fact.attrs['@_contextRef']),unit=units.get(fact.attrs['@_unitRef']);
  if(ctx&&unsupportedUnits.has(fact.attrs['@_unitRef']))fail('unsupported compound unit structure');
  const expected=field.unit==='shares'?'shares':field.unit==='eps'?route!.currency+'/shares':route!.currency;
  if(!ctx||ctx.instant!==!!field.instant||unit!==expected)continue;
  if(Object.entries(fact.attrs).some(([k,v])=>{const q=qname(k.replace(/^@_/,''),fact.scope);return q.uri==='http://www.w3.org/2001/XMLSchema-instance'&&q.name==='nil'&&['true','1'].includes(v);}))continue;
  const scale=Number(fact.attrs['@_scale']??0),sign=fact.attrs['@_sign'];
  if(!Number.isInteger(scale)||Math.abs(scale)>12||(sign!==undefined&&sign!=='-'))fail('invalid scale/sign');
  if(fact.attrs['@_continuedAt']||fact.attrs['@_target']||fact.attrs['@_tupleRef']||unsupportedContent(fact.children,fact.scope))fail('unsupported numeric inline content or target');
  const raw=text(fact.children),value=numberValue(raw,fact.attrs['@_format'],fact.scope)*Math.pow(10,scale)*(sign==='-'?-1:1);
  if(!Number.isFinite(value))fail('non-finite scaled value');
  const p=periods.get(ctx.end)??{period_start:ctx.start??'',period_end:ctx.end,fiscal_period:'FY',is_comparative:ctx.end!==reportEnd,metrics:{},raw_facts:{}};
  if(ctx.start){if(p.period_start&&p.period_start!==ctx.start)fail('conflicting annual durations');p.period_start=ctx.start;}
  if(p.metrics[field.metric]!==undefined&&p.metrics[field.metric]!==value)fail('conflicting duplicate annual facts');
  p.metrics[field.metric]=value;
  p.raw_facts[field.metric]={value,unit:unit!,raw_value:raw,scale:Math.pow(10,scale),reported_scale:scale,
   source_label:concept.name,source_locator:fact.attrs['@_id']??fact.attrs['@_contextRef'],context_id:fact.attrs['@_contextRef'],
   concept:`{${concept.uri}}${concept.name}`,...(fact.attrs['@_format']?{transformation:fact.attrs['@_format']}:{})};
  periods.set(ctx.end,p);
 }
 const result=[...periods.values()].filter(p=>p.period_start&&['revenue','profit_loss','profit_loss_attributable_to_owners','total_assets','operating_cash_flow'].every(k=>p.metrics[k]!==undefined)).sort((a,b)=>b.period_end.localeCompare(a.period_end));
 if(result.length!==2||result[0].period_end!==reportEnd||!result[1].is_comparative)fail('complete current/comparative native annual facts unavailable');
 return result;
}
