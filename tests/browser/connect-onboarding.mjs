// Isolated browser onboarding regression; never authorizes against production.
// Server: NODE_OPTIONS="--require ./tests/browser/public-auth-fixtures.cjs" pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3100
// Chrome: headless, remote-debugging-port=9223, fresh temporary user-data-dir.
// Run: node --experimental-strip-types tests/browser/connect-onboarding.mjs
import { MCP_SERVER_URL, CONNECT_EXAMPLES } from '../../lib/connect-guide.ts';
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

await send('Page.bringToFront');
await send('Browser.grantPermissions',{origin:'http://127.0.0.1:3100',permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
await send('Network.clearBrowserCookies');
await navigate('/connect','Connect to ChatGPT');
assert.equal(await evaluate('document.querySelectorAll("h1").length'),1);
assert.equal(await evaluate('document.querySelectorAll("main").length'),1);
assert.equal(await evaluate(`document.querySelector('nav a[href="/signup"]')?.textContent.trim()`), 'Get started');
for(const width of [1440,1024,768,390,320]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'overflow '+width);
 assert.equal(await evaluate('document.querySelectorAll("a button,button a").length'),0);
 assert.equal(await evaluate('Array.from(document.querySelectorAll("textarea")).every(t=>!!document.querySelector(`label[for="${t.id}"]`) && t.readOnly)'),true);
}
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
const fields=[['MCP server URL',MCP_SERVER_URL],...CONNECT_EXAMPLES.map(example=>[`${example.title} prompt`,example.prompt])];
for(const [label,text] of fields) {
 await evaluate(`document.querySelector('button[aria-label=${JSON.stringify('Copy '+label)}]').focus()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor(`Array.from(document.querySelectorAll('[role="status"]')).some(s=>s.textContent===${JSON.stringify(label+' copied to clipboard.')})`);
 assert.equal(await evaluate('navigator.clipboard.readText()'),text);
}
// Both denied and unsupported clipboard paths select the text and announce how to copy manually.
for(const unavailable of ['{writeText:async()=>{throw new DOMException("Denied","NotAllowedError")}}','undefined']) {
 await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:${unavailable}})`);
 await evaluate('document.querySelector(\'button[aria-label="Copy MCP server URL"]\').click()');
 await waitFor('document.querySelector("textarea").nextElementSibling.textContent.includes("Copy is unavailable")');
 assert.equal(await evaluate('document.activeElement===document.querySelector("textarea")'),true);
 assert.equal(await evaluate('document.querySelector("textarea").selectionEnd-document.querySelector("textarea").selectionStart'),MCP_SERVER_URL.length);
 await evaluate('delete navigator.clipboard');
}
await evaluate('document.querySelector("details summary").focus()');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
assert.equal(await evaluate('document.querySelector("details").open'),true);
// Signed-out marketing link, client navigation and direct refresh retain onboarding access.
await navigate('/','Less scattered searching');
await evaluate('document.querySelector(\'nav a[href="/connect"]\').click()');
await waitFor('location.pathname==="/connect" && !!document.querySelector("textarea")');
await send('Page.reload');
await waitFor('!!document.querySelector("textarea") && document.querySelector("h1")?.textContent==="Connect to ChatGPT"');
// Synthetic website authentication affects only the website CTAs.
await send('Network.setCookie',{name:'session',value:'11111111-1111-4111-8111-111111111111',url:'http://127.0.0.1:3100',httpOnly:true});
await navigate('/connect','Connect to ChatGPT');
assert.equal(await evaluate('document.querySelector(\'nav a[href="/dashboard"]\')?.textContent.trim()'),'Go to Dashboard');
assert.equal(await evaluate('!!document.querySelector(\'a[href="/signup"]\')'),false);
assert.equal(await evaluate('document.body.innerText.includes("member@example.test")'),false);
await evaluate('document.querySelector(\'nav a[href="/dashboard"]\').click()');
await waitFor('location.pathname==="/dashboard" && !!document.getElementById("dashboard-content")');
assert.deepEqual(errors,[]);
console.log('PASS: public/signed-in onboarding, navigation/refresh, widths 1440/1024/768/390/320, exact clipboard text, keyboard activation, denied/unsupported manual fallback, labels/live feedback, accordion, no hydration/console errors');
await send('Browser.resetPermissions');
ws.close();
