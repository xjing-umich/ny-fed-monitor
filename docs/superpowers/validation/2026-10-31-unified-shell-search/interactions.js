async(page)=>{
 const checks=[];const check=(n,p,d)=>{checks.push({name:n,pass:p,detail:d});if(!p)throw Error(n+': '+JSON.stringify(d));};
 const base='http://localhost:3114';
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/zh/stocks?tc_internal=1',{waitUntil:'load'});
 const box=page.getByRole('combobox');
 for(const [q,href] of [['T','/zh/stocks/T'],['MA','/zh/stocks/MA'],['苹果','/zh/stocks/AAPL'],['巴菲特','/zh/investors/berkshire-hathaway']]){
  await box.fill(q);await page.waitForFunction(h=>document.querySelector('[role=option]')?.getAttribute('href')===h,href);
  check('shared lookup '+q,await page.getByRole('option').first().getAttribute('href')===href);
 }
 await box.fill('zzzznonexistent');await page.getByText('没有找到已收录的公司或投资人。可换用名称或股票代码。').waitFor();
 await box.press('Enter');check('unknown stays put',new URL(page.url()).pathname==='/zh/stocks');
 await box.fill('AAPL');await page.getByRole('option').first().waitFor();
 await box.press('ArrowUp');check('up selects last',Boolean(await box.getAttribute('aria-activedescendant')));
 await box.press('Escape');check('escape closes results',await box.getAttribute('aria-expanded')==='false');
 const filter=page.locator('main input');await filter.fill('AAPL');await page.getByText('匹配 1 / 共', {exact:false}).waitFor();
 check('local filter only AAPL',(await page.locator('main tbody').first().innerText()).includes('AAPL'));
 await filter.fill('');await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('第 2 / 49 页',{exact:true}).waitFor();check('list pagination',true);
 await page.getByRole('button',{name:/合计持仓市值/}).filter({visible:true}).first().click();
 await page.waitForFunction(()=>new URL(location.href).searchParams.get('sort')==='value');check('list sort keeps URL',true);
 await filter.fill('AAPL');await page.getByText('匹配 1 / 共', {exact:false}).waitFor();
 await page.evaluate(()=>{location.hash='main-content'});
 await page.getByRole('link',{name:'Switch to English',exact:true}).click();await page.waitForURL(u=>u.pathname==='/stocks'&&u.searchParams.get('q')==='AAPL'&&u.searchParams.get('sort')==='value'&&u.hash==='#main-content');
 check('locale keeps filter sort and fragment',new URL(page.url()).pathname==='/stocks',page.url());
 await page.getByRole('link',{name:'切换到中文',exact:true}).click();await page.waitForURL(/\/zh\/stocks\?/);check('locale switches back',true);
 await page.setViewportSize({width:375,height:812});
 await page.getByRole('button',{name:'打开菜单'}).click();await page.waitForFunction(()=>document.querySelector('dialog').matches(':modal'));
 const menuBox=page.getByRole('dialog').getByRole('combobox');check('menu focuses search',await menuBox.evaluate(e=>e===document.activeElement));
 await menuBox.fill('MA');await page.getByRole('dialog').getByRole('option').first().waitFor();
 await menuBox.press('Escape');check('first Escape leaves menu',await page.getByRole('dialog').isVisible());
 await menuBox.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);check('second Escape returns focus',await page.getByRole('button',{name:'打开菜单'}).evaluate(e=>e===document.activeElement));
 await page.getByRole('button',{name:'打开菜单'}).click();await page.getByRole('dialog').getByRole('link',{name:'学习',exact:true}).click();await page.waitForURL('**/zh/learn');await page.waitForFunction(()=>!document.querySelector('dialog').open);check('route selection closes menu',true);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/zh',{waitUntil:'load'});check('home has one main search',await page.getByRole('combobox').count()===1);
 return {passed:checks.length,checks};
}
