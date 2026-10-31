async(page)=>{
 const checks=[],errors=[];
 const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
 const onError=e=>errors.push(e.message);page.on('pageerror',onError);
 await page.addInitScript(()=>localStorage.setItem('tc_internal','1'));
 await page.emulateMedia({reducedMotion:'reduce'});
 const base='http://localhost:3114';
 for(const lang of ['zh','en']){
  const prefix=lang==='zh'?'/zh':'';
  for(const route of ['', '/stocks','/investors','/stocks/AAPL','/investors/berkshire-hathaway','/stocks/screener?view=strike_zone','/learn']){
   await page.goto(base+prefix+route,{waitUntil:'load'});
   await page.locator('[data-site-header]').waitFor();
   for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const theme of ['light','dark']){
     const dark=theme==='dark';
     if(await page.locator('html').evaluate(n=>n.classList.contains('dark'))!==dark){
      await page.getByRole('button',{name:lang==='zh'?'切换主题':'Toggle theme',exact:true}).click();
      await page.waitForFunction(d=>document.documentElement.classList.contains('dark')===d,dark);
     }
     const state=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,header:document.querySelectorAll('[data-site-header]').length,brand:getComputedStyle(document.documentElement).getPropertyValue('--brand'),positive:getComputedStyle(document.documentElement).getPropertyValue('--positive'),active:[...document.querySelectorAll('[data-site-header] > div nav [aria-current]')].map(n=>n.getAttribute('href'))}));
     check([lang,route||'home',width,theme].join('/'),state.w===state.sw&&state.header===1&&state.positive.trim()!==state.brand.trim(),state);
    }
   }
  }
 }
 page.off('pageerror',onError);
 check('no runtime errors',errors.length===0,errors);
 return {passed:checks.length,errors};
}
