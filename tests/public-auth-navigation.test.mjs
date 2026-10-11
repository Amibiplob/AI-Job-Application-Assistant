import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('tsx/cjs');
const Module=require('node:module');
const originalLoad=Module._load;
const cookieValues=new Map();
const sessions=new Map();
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Synthetic Member',email:'member@example.test'};
const valid='11111111-1111-4111-8111-111111111111';
const expired='22222222-2222-4222-8222-222222222222';
let queries=[];
const pool={query:async (sql,params)=>{
 queries.push(sql);
 if(sql.includes('SELECT id, user_id, expires_at')) {assert.match(sql,/expires_at > now\(\)/); const row=sessions.get(params[0]); return {rows:row?.expires_at>new Date()? [row]:[]};}
 if(sql.includes('SELECT id, email, name FROM users')) return {rows:params[0]===user.id?[user]:[]};
 if(sql.includes('DELETE FROM sessions')) {sessions.delete(params[0]);return {rows:[]};}
 throw Error('Unexpected synthetic query');
}};
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='next/headers')return {cookies:async()=>({get:name=>cookieValues.has(name)?{value:cookieValues.get(name)}:undefined,delete:name=>cookieValues.delete(name)})};
 if(id==='@/lib/db/pool')return {pool};
 return originalLoad.call(this,id,...args);
};
const auth=require('../lib/auth.ts');
Module._load=function(id,...args){
 if(id==='@/lib/auth')return auth;
 if(id==='server-only')return {};
 if(id==='@/lib/db/pool')return {pool};
 if(id==='next/navigation')return {redirect:path=>{throw Object.assign(Error('Redirect'),{path});}};
 return originalLoad.call(this,id,...args);
};
const Home=require('../app/page.tsx').default;
const LoginPage=require('../app/login/page.tsx').default;
const SignupPage=require('../app/signup/page.tsx').default;
const {logout}=require('../app/dashboard/actions.ts');
Module._load=originalLoad;
const {renderToStaticMarkup}=require('react-dom/server');
const render=async page=>renderToStaticMarkup(await page());
function account(cookie){cookieValues.clear();sessions.clear();queries=[];if(cookie)cookieValues.set('session',cookie);sessions.set(valid,{id:valid,user_id:user.id,expires_at:new Date('2099-01-01')});sessions.set(expired,{id:expired,user_id:user.id,expires_at:new Date('2000-01-01')});}

test('logged-out landing preserves public navigation and signup CTAs',async()=>{
 account();const html=await render(Home);assert.match(html,/href="\/login"[^>]*>Sign in/);assert.match(html,/href="\/signup"[^>]*>Get started/);assert.match(html,/Create your workspace/);assert.doesNotMatch(html,/Go to Dashboard/);
});
test('valid session switches every public account CTA without exposing account data',async()=>{
 account(valid);const html=await render(Home);assert.match(html,/Go to Dashboard/);assert.match(html,/Your workspace/);assert.equal((html.match(/href="\/dashboard"/g)||[]).length,5);assert.doesNotMatch(html,/href="\/(login|signup)"/);for(const privateValue of [valid,user.id,user.email])assert.ok(!html.includes(privateValue));
 for(const page of [LoginPage,SignupPage])await assert.rejects(page(),error=>error.path==='/dashboard');
});
test('missing, malformed, expired and revoked sessions keep authentication forms accessible',async()=>{
 for(const cookie of [undefined,'invalid-session',expired,'33333333-3333-4333-8333-333333333333']){
  account(cookie);assert.equal(await auth.getCurrentUser(),null);assert.match(await render(Home),/Sign in/);assert.match(await render(LoginPage),/<form/);assert.match(await render(SignupPage),/<form/);
  if(!cookie||cookie==='invalid-session')assert.equal(queries.length,0);
 }
});
test('alternating sessions do not reuse public output, and logout restores public navigation',async()=>{
 account(valid);assert.match(await render(Home),/Go to Dashboard/);
 cookieValues.clear();assert.doesNotMatch(await render(Home),/Go to Dashboard/);
 cookieValues.set('session',valid);assert.match(await render(Home),/Go to Dashboard/);
 await assert.rejects(logout(),error=>error.path==='/login');assert.equal(sessions.has(valid),false);assert.equal(cookieValues.has('session'),false);assert.doesNotMatch(await render(Home),/Go to Dashboard/);
});
