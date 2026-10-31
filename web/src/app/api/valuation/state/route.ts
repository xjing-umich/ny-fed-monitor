import { readPublicValuationStates, PublicationUnavailableError } from '@/lib/valuation/publishedRead';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 const raw=new URL(request.url).searchParams.get('tickers')??'';
 const tickers=[...new Set(raw.split(',').map(t=>t.trim().toUpperCase()))];
 if(tickers.length>100||tickers.some(t=>! /^[A-Z]{1,6}(\.[A-Z])?$/.test(t)))return Response.json({error:'invalid_tickers'},{status:400,headers});
 try{
  const states=await readPublicValuationStates(tickers);
  return Response.json({states:tickers.map(ticker=>({ticker,...states.get(ticker)}))},{headers});
 }catch(error){if(!(error instanceof PublicationUnavailableError))throw error;return Response.json({error:error.reason},{status:503,headers});}
}
