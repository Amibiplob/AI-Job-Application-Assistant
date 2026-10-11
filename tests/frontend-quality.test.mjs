import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('tsx/cjs');
const Module=require('node:module');const original=Module._load;
Module._load=function(id,...args){if(id==='./actions')return {login:async()=>({}),signup:async()=>({})};return original.call(this,id,...args);};
const Login=require('../app/login/login-form.tsx').LoginForm;
const Signup=require('../app/signup/signup-form.tsx').SignupForm;
Module._load=original;
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const luminance=color=>color.match(/[a-f\d]{2}/gi).map(hex=>parseInt(hex,16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((total,value,index)=>total+value*[.2126,.7152,.0722][index],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('input boundaries and helper text meet minimum contrast on their light surfaces',async()=>{
 const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');const token=name=>css.match(new RegExp(`--${name}: (#[a-f0-9]{6});`))[1];for(const background of [token('canvas'),token('card')])assert.ok(contrast(token('input'),background)>=3);assert.ok(contrast(token('muted-foreground'),token('card'))>=4.5);
 for(const file of ['login/page.tsx','signup/page.tsx','login/login-form.tsx','signup/signup-form.tsx']){const source=await readFile(new URL('../app/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/#718675|#7b827a|#dfe4dc/);}
});
test('auth inputs stay controlled from first render without changing field/action contracts',async()=>{
 for(const [name,Component,fields] of [['login',Login,['email','password']],['signup',Signup,['name','email','password','confirmPassword']]]){
  const source=await readFile(new URL(`../app/${name}/${name}-form.tsx`,import.meta.url),'utf8');assert.doesNotMatch(source,/defaultValue=/);const html=renderToStaticMarkup(React.createElement(Component));for(const field of fields)assert.ok(html.includes(`name="${field}"`));assert.match(html,/name="email"[^>]*value=""/);assert.match(html,/type="password"/);assert.match(html,/novalidate=""/i);
 }
});

test('analysis drafts are scoped to the authenticated layout and never persisted externally',async()=>{
 const [layout,provider]=await Promise.all([readFile(new URL('../app/dashboard/layout.tsx',import.meta.url),'utf8'),readFile(new URL('../components/jobs/analysis-draft.tsx',import.meta.url),'utf8')]);
 assert.match(layout,/<AnalysisDraftProvider key={currentUser.id}>/);assert.ok(layout.indexOf('if (!currentUser) redirect("/login")')<layout.indexOf('<AnalysisDraftProvider'));
 assert.doesNotMatch(provider,/localStorage|sessionStorage|fetch\(|indexedDB|lib\/db/);
});
