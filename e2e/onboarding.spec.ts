import { test, expect, type Page } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';
async function setup(page: Page, role: 'owner'|'admin'|'manager'|'employee' = 'owner', complete = false) {
 await authenticate(page);const api=await stubApi(page);api.role=role;
 await page.route('**/rest/v1/business_branding*',route=>route.fulfill({json:{theme_key:'topdrawer',primary_color:'#747C61',secondary_color:'#4C4E56',accent_color:'#747C61',surface_color:'#FFFFFF'}}));
 let state={welcomed:complete,hidden:false,dismissed:false,completed:complete?['stores','policy','team','publish']:role==='employee'?[]:['stores']};
 const actions:Record<string,unknown>[]=[];
 await page.route('**/rest/v1/rpc/get_onboarding_status',route=>route.fulfill({json:state}));
 await page.route('**/rest/v1/rpc/update_onboarding',route=>{
  const body=route.request().postDataJSON();actions.push(body);
  state={...state,dismissed:state.dismissed||body._action==='dismiss',welcomed:state.welcomed||body._action==='welcome',hidden:body._action==='hide'?true:body._action==='show'?false:state.hidden,completed:body._action==='explore'?[...new Set([...state.completed,body._step])]:state.completed};
  return route.fulfill({json:state});
 });
 return {actions,get state(){return state;}};
}
for(const width of [1280,390]) test(`owner onboarding matches desktop and mobile at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const fixture=await setup(page);await page.goto('/dashboard');
 const welcome=page.getByRole('dialog',{name:'Welcome to Test Shop'});await expect(welcome).toBeVisible();
 if(width===1280)await page.screenshot({path:info.outputPath('welcome.png'),fullPage:true});
 // Existing dialog focus containment applies to the onboarding welcome too.
 for(let i=0;i<7;i++){await page.keyboard.press('Tab');expect(await welcome.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await welcome.getByRole('button',{name:'Explore dashboard'}).click();await expect(welcome).toHaveCount(0);
 const checklist=page.getByRole('region',{name:'Get your workspace ready'});await expect(checklist.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await expect(checklist.getByRole('button',{name:'Set leave policy',exact:true})).toBeVisible();
 if(width===390){await expect(checklist.getByText('Invite your team',{exact:true})).toBeHidden();await checklist.getByRole('button',{name:'View all steps'}).click();await expect(checklist.getByText('Invite your team',{exact:true})).toBeVisible();await checklist.getByRole('button',{name:'Show next step only'}).click();}
 if(width===390){const text=await checklist.getByText('Set your leave policy',{exact:true}).locator('..').boundingBox();expect(text!.width).toBeGreaterThan(200);}
 await page.getByRole('heading',{name:/Good/}).click();await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:info.outputPath('owner-checklist.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await checklist.getByRole('button',{name:'Hide for now'}).click();await expect(checklist).toHaveCount(0);
 await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Setup guidance is hidden.')).toBeVisible();
 await page.getByRole('button',{name:'View setup checklist'}).click();await expect(checklist).toBeVisible();expect(fixture.state.hidden).toBe(false);
});
test('setup deep link opens Business settings despite a previously remembered Theme section',async({page})=>{
 await setup(page);await page.addInitScript(()=>sessionStorage.setItem('settings.activeSection','theme'));await page.goto('/dashboard');
 await page.getByRole('dialog').getByRole('button',{name:'Start setup'}).click();await expect(page).toHaveURL(/settings\?section=business/);await expect(page.getByText('Leave year',{exact:true})).toBeVisible();
});
test('employee guidance records exploration without revealing setup controls',async({page},info)=>{
 await page.setViewportSize({width:390,height:900});const fixture=await setup(page,'employee');await page.goto('/dashboard');
 await page.getByRole('dialog').getByRole('button',{name:'Explore dashboard'}).click();
 const checklist=page.getByRole('region',{name:'Find your way around'});await expect(checklist).toBeVisible();await expect(page.getByText('Set your leave policy')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('employee-checklist.png'),fullPage:true});
 await checklist.getByRole('button',{name:'Open Find your shifts'}).click();await expect(page).toHaveURL(/\/rota$/);
 await expect.poll(()=>fixture.actions.some(action=>action._action==='explore'&&action._step==='rota')).toBe(true);
 await page.goto('/dashboard');await expect(page.getByRole('progressbar',{name:'Pages explored'})).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('failed preference save stays visible and can retry without getting stuck',async({page})=>{
 await setup(page);let fail=true;
 await page.route('**/rest/v1/rpc/update_onboarding',async route=>{if(fail)return route.fulfill({status:400,json:{message:'Could not save onboarding'}});return route.fallback();});
 await page.goto('/dashboard');const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Explore dashboard'}).click();await expect(dialog.getByRole('alert')).toContainText('Could not save onboarding');
 await expect(dialog.getByRole('button',{name:'Explore dashboard'})).toBeEnabled();fail=false;await dialog.getByRole('button',{name:'Explore dashboard'}).click();await expect(dialog).toHaveCount(0);
});
for(const role of ['manager','admin'] as const)test(`${role} gets appropriate guidance`,async({page})=>{
 await setup(page,role);await page.goto('/dashboard');await page.getByRole('dialog').getByRole('button',{name:'Explore dashboard'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 if(role==='manager'){await expect(page.getByText('Review your team',{exact:true})).toBeVisible();await expect(page.getByText('Set your leave policy')).toHaveCount(0);}else{await expect(page.getByText('Set your leave policy',{exact:true})).toBeVisible();}
});

for (const width of [1280, 390]) test(`completed onboarding can be permanently hidden at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 const fixture = await setup(page, 'owner', true);
 await page.goto('/dashboard');
 const dismiss = page.getByRole('button', { name: 'Hide onboarding permanently' });
 await expect(dismiss).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await dismiss.click();
 await expect(dismiss).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'View setup checklist' })).toHaveCount(0);
 expect(fixture.state.dismissed).toBe(true);
 fixture.state.completed = [];
 const reloaded = page.waitForResponse('**/rest/v1/rpc/get_onboarding_status');
 await page.reload(); await reloaded;
 await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
 await expect(page.getByRole('status', { name: 'Loading setup progress' })).toHaveCount(0);
 await expect(page.getByText('Setup guidance is hidden.')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'View setup checklist' })).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Get your workspace ready' })).toHaveCount(0);
});
