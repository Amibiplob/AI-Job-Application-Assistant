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
let pathname='/dashboard';
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
 if(id==='next/navigation')return {usePathname:()=>pathname,redirect:path=>{throw Object.assign(Error('Redirect'),{path});}};
 return originalLoad.call(this,id,...args);
};
const Home=require('../app/page.tsx').default;
const LoginPage=require('../app/login/page.tsx').default;
const SignupPage=require('../app/signup/page.tsx').default;
const {logout}=require('../app/dashboard/actions.ts');
const {Sidebar}=require('../components/layout/sidebar.tsx');
const {Navbar}=require('../components/layout/navbar.tsx');
Module._load=originalLoad;
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const render=async page=>renderToStaticMarkup(await page());
function account(cookie){cookieValues.clear();sessions.clear();queries=[];if(cookie)cookieValues.set('session',cookie);sessions.set(valid,{id:valid,user_id:user.id,expires_at:new Date('2099-01-01')});sessions.set(expired,{id:expired,user_id:user.id,expires_at:new Date('2000-01-01')});}

function links(html) {
 return Array.from(html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs), ([,attributes,content]) => ({
  href:attributes.match(/href="([^"]*)"/)?.[1],
  label:content.replace(/<[^>]*>/g,'').trim(),
  current:attributes.includes('aria-current="page"'),
 }));
}

test('logged-out landing preserves public navigation and signup CTAs',async()=>{
 account();const html=await render(Home);assert.match(html,/href="\/login"[^>]*>Sign in/);assert.match(html,/href="\/signup"[^>]*>Get started/);assert.match(html,/Create your workspace/);assert.doesNotMatch(html,/Go to Dashboard/);
});
test('valid session switches every public account CTA without exposing account data',async()=>{
 account(valid);const html=await render(Home);
 const destinations=links(html);
 for(const label of ['Go to Dashboard','Your workspace']) {
  const ctas=destinations.filter(link=>link.label===label);
  assert.ok(ctas.length>0,`Missing ${label} CTA`);
  for(const cta of ctas)assert.equal(cta.href,'/dashboard',label);
 }
 for(const region of ['header','main','footer']) {
  const content=html.match(new RegExp(`<${region}\\b[^>]*>(.*?)</${region}>`,'s'))?.[1];
  assert.ok(content,`Missing ${region}`);
  assert.ok(links(content).some(link=>link.href==='/dashboard' && ['Go to Dashboard','Your workspace'].includes(link.label)),`${region} must provide workspace access`);
 }
 assert.doesNotMatch(html,/href="\/(login|signup)"/);for(const privateValue of [valid,user.id,user.email])assert.ok(!html.includes(privateValue));
 for(const page of [LoginPage,SignupPage])await assert.rejects(page(),error=>error.path==='/dashboard');
});

test('desktop and mobile dashboard navigation render supported destinations and active indicators',()=>{
 const expected=[
  {label:'Overview',href:'/dashboard'},
  {label:'Resume',href:'/dashboard/resume'},
  {label:'Jobs',href:'/dashboard/jobs'},
  {label:'Analyze a job',href:'/dashboard/analyze'},
  {label:'Applications',href:'/dashboard/applications'},
 ];
 for(const route of [...expected.map(link=>link.href),'/dashboard/jobs/synthetic-id','/dashboard/jobs-extra']) {
  pathname=route;
  const desktop=renderToStaticMarkup(React.createElement(Sidebar));
  const mobile=renderToStaticMarkup(React.createElement(Navbar,{name:user.name,email:user.email,logoutControl:React.createElement('button',null,'Log out')}));
  for(const [html,label] of [[desktop,'Dashboard navigation'],[mobile,'Mobile dashboard navigation']]) {
   const nav=html.match(new RegExp(`<nav aria-label="${label}">(.*?)</nav>`,'s'))?.[1];
   assert.ok(nav,label);
   const destinations=links(nav);
   assert.deepEqual(destinations.map(({label,href})=>({label,href})),expected);
   assert.deepEqual(destinations.filter(link=>link.current).map(link=>link.href),route==='/dashboard/jobs/synthetic-id'?['/dashboard/jobs']:expected.some(link=>link.href===route)?[route]:[]);
   assert.match(html,/Log out/);
  }
 }
 pathname='/dashboard';
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
