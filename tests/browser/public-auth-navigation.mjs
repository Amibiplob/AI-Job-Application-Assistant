// Manual authentication Chrome CDP regression. Start the fixture server on 3100 and Chrome CDP on 9223.
// Server: NODE_OPTIONS="--require ./tests/browser/public-auth-fixtures.cjs" pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3100
// Use a fresh server for each run; all database queries are intercepted and never forwarded.
import assert from 'node:assert/strict';
const targets=await (await fetch('http://127.0.0.1:9223/json')).json();
const ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let id=0; const pending=new Map(); let errors=[];
ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);if(p){pending.delete(d.id);if(d.error)p.reject(d.error);else p.resolve(d.result);}}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(d.params.type))errors.push(d.params.args.map(a=>a.value||a.description).join(' '));});
const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));});
const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);return response.result.value;};
async function waitFor(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,300));}throw new Error('Timed out: '+expression);}
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});errors=[];
async function navigate(path,heading){const loaded=new Promise(resolve=>{const handler=e=>{if(JSON.parse(e.data).method==='Page.loadEventFired'){ws.removeEventListener('message',handler);resolve();}};ws.addEventListener('message',handler);});await send('Page.navigate',{url:'http://127.0.0.1:3100'+path});await loaded;await waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);await new Promise(r=>setTimeout(r,600));}
async function setAccount(kind){const value={empty:'11111111-1111-4111-8111-111111111111',populated:'22222222-2222-4222-8222-222222222222',failed:'33333333-3333-4333-8333-333333333333'}[kind];await send('Network.setCookie',{name:'session',value,url:'http://127.0.0.1:3100',httpOnly:true});}
async function assertHome(authenticated){const text=await evaluate('document.querySelector("header").innerText');assert.equal(text.includes('Go to Dashboard'),authenticated);assert.equal(text.includes('Sign in'),!authenticated);assert.equal(await evaluate(`!!document.querySelector('a[href="/signup"]')`),!authenticated);}
async function responsive(){for(const width of [1440,768,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'overflow '+width);assert.equal(await evaluate('document.querySelectorAll("a button,button a").length'),0);}}
async function fill(id,value){await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);await send('Input.insertText',{text:value});}
async function logout(){await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Log out')).click()`);await waitFor('location.pathname==="/login" && !!document.querySelector("form")');}
async function homeFromDashboard(){await evaluate(`document.querySelector('aside a[href="/"]').click()`);await waitFor('location.pathname==="/" && !!document.getElementById("hero-heading")');await assertHome(true);}
// Alternating raw HTTP requests must not share authentication-dependent HTML.
for(const authenticated of [true,false,true,false]){
 const response=await fetch('http://127.0.0.1:3100/',{headers:authenticated?{Cookie:'session=11111111-1111-4111-8111-111111111111'}:{}});
 assert.match(response.headers.get('cache-control'),/no-store|no-cache/); // Development uses no-cache; production must use no-store.
 assert.equal((await response.text()).includes('Go to Dashboard'),authenticated);
}
await send('Network.clearBrowserCookies');
await navigate('/','Less scattered searching.');await assertHome(false);await responsive();
for(const path of ['/login','/signup']){await navigate(path,path==='/login'?'Sign in':'Create your account');assert.equal(await evaluate('location.pathname'),path);assert.equal(await evaluate('document.querySelectorAll("form").length'),1);}
await navigate('/dashboard','Sign in');assert.equal(await evaluate('location.pathname'),'/login');
for(const cookie of ['invalid-session','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']){
 await send('Network.setCookie',{name:'session',value:cookie,url:'http://127.0.0.1:3100',httpOnly:true});await navigate('/','Less scattered searching.');await assertHome(false);await navigate('/login','Sign in');await navigate('/signup','Create your account');
}
await setAccount('empty');await navigate('/','Less scattered searching.');await assertHome(true);await responsive();
for(const path of ['/login','/signup']){await navigate(path,'Your search, at a glance');assert.equal(await evaluate('location.pathname'),'/dashboard');}
await homeFromDashboard();await evaluate(`document.querySelector('header a[href="/dashboard"]').click()`);await waitFor('location.pathname==="/dashboard"');await logout();
await evaluate(`document.querySelector('header a[href="/"]').click()`);await waitFor('location.pathname==="/" && !!document.getElementById("hero-heading")');await assertHome(false);
await setAccount('empty');await navigate('/','Less scattered searching.');await assertHome(false); // Revoked by the earlier logout.
await send('Network.clearBrowserCookies');
// Exercise the unchanged login action with a synthetic password and real Argon2 verification.
await navigate('/login','Sign in');await evaluate('document.querySelector("form button[type=submit]").click()');await waitFor('!!document.getElementById("email-error")');await fill('email','member@example.test');await fill('password','Synthetic-pass-123!');await evaluate('document.querySelector("form button[type=submit]").click()');await waitFor('location.pathname==="/dashboard"');
await homeFromDashboard();await navigate('/','Less scattered searching.');await assertHome(true);await navigate('/dashboard','Your search, at a glance');await logout();
await navigate('/signup','Create your account');await evaluate('document.querySelector("form button[type=submit]").click()');await waitFor('!!document.getElementById("name-error")');await fill('name','Synthetic New Member');await fill('email','new-member@example.test');await fill('password','Synthetic-pass-123!');await fill('confirmPassword','Synthetic-pass-123!');await evaluate('document.querySelector("form button[type=submit]").click()');await waitFor('location.pathname==="/dashboard"');await homeFromDashboard();
// Existing protected forms change defaultValue after validation; report their known Base UI warning.
const knownWarnings=errors.filter(error=>error.startsWith('Base UI: A component is changing the default value state of an uncontrolled FieldControl'));
assert.deepEqual(errors.filter(error=>!knownWarnings.includes(error)),[]);
console.log('Existing auth-form defaultValue warnings:',knownWarnings.length);
console.log('PASS: public navigation at 1440/768/390/320, valid/invalid/expired/revoked sessions, server redirects, dashboard protection, unchanged login/signup actions, logout, refresh and client navigation; no hydration errors or unexpected console warnings.');ws.close();
