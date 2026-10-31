import 'server-only';
import { PublicationUnavailableError } from './publishedRead';
export type ValuationAvailability<T>={value:T;unavailable:null}|{value:null;unavailable:PublicationUnavailableError['reason']};
/** Catch only the typed publication failure, at the optional valuation UI boundary. */
export async function optionalValuation<T>(read:Promise<T>):Promise<ValuationAvailability<T>>{
 try{return {value:await read,unavailable:null};}catch(error){if(error instanceof PublicationUnavailableError)return {value:null,unavailable:error.reason};throw error;}
}
