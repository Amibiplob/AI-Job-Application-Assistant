import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('tsx/cjs');
const Module=require('node:module');const original=Module._load;
let authenticated=true,resume=null,failed=false,reads=0,queries=[];
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='@/lib/auth')return {getCurrentUser:async()=>authenticated?{id:'synthetic'}:null,getSession:async()=>authenticated?{userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}:null};
 if(id==='@/lib/resumes')return {getResume:async()=>{reads++;if(failed)throw Error('Synthetic');return resume;}};
 if(id==='@/lib/db/pool')return {pool:{query:async(sql,values)=>{queries.push({sql,values});return {rows:[]};}}};
 if(id==='next/navigation')return {redirect:path=>{throw Object.assign(Error('Redirect'),{path});}};
 return original.call(this,id,...args);
};
const Page=require('../app/dashboard/analyze/page.tsx').default;
const Form=require('../app/dashboard/analyze/analyze-form.tsx').AnalyzeForm;
const Results=require('../components/jobs/analysis-results.tsx').AnalysisResults;
const {analyzeJobDescription}=require('../app/dashboard/analyze/actions.ts');
const {getResume}=require('../lib/resumes.ts');
const {analyzeJobDescriptionAgainstResume}=require('../lib/job-matching.ts');
Module._load=original;
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const values={title:'Synthetic developer',company:'Example employer',description:'React TypeScript SQL'};
const data=()=>{const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,value);return form;};
test('readiness handles missing, empty, ready and failed resume reads',async()=>{
 resume=null;assert.match(renderToStaticMarkup(await Page()),/Save your resume first/);resume={content:'  '};assert.match(renderToStaticMarkup(await Page()),/Your saved resume is empty/);resume={content:'React'};assert.match(renderToStaticMarkup(await Page()),/Saved resume ready/);failed=true;assert.match(renderToStaticMarkup(await Page()),/Resume status unavailable/);failed=false;
});
test('initial form has stable counts, associated labels and genuine guidance',()=>{
 const html=render(Form);assert.match(html,/0 \/ 20000 characters/);assert.match(html,/0 \/ 200 characters/);assert.match(html,/Your comparison appears here/);assert.match(html,/Example only/);assert.match(html,/not saved or sent to an external service/);assert.match(html,/aria-describedby="analysis-description-help"/);assert.doesNotMatch(html,/suppressHydrationWarning/);
});
test('results preserve matcher output, recognized denominator, zero and null scores',()=>{
 for(const [description,expected] of [['SQL','0%'],['A thoughtful colleague','Not scored'],['React SQL','50%']]){const analysis=analyzeJobDescriptionAgainstResume('React',description);const html=render(Results,{analysis,values});assert.match(html,new RegExp(expected));assert.ok(html.includes(analysis.nextStep.replaceAll('&','&amp;')));assert.match(html,/Recognized-skill text overlap/);if(analysis.score===null)assert.doesNotMatch(html,/0%/);}
 const html=render(Results,{analysis:analyzeJobDescriptionAgainstResume('React','React SQL'),values});assert.match(html,/1 of 2 recognized job skills/);assert.match(html,/Job skills not detected in your resume/);
});
test('existing action retains validation values, all outcomes, and authorization before resume reads',async()=>{
 authenticated=false;reads=0;await assert.rejects(Page(),error=>error.path==='/login');await assert.rejects(analyzeJobDescription({status:'idle'},data()),error=>error.path==='/login');assert.equal(reads,0);authenticated=true;
 const invalid=data();invalid.set('description','  ');const response=await analyzeJobDescription({status:'idle'},invalid);assert.equal(response.status,'invalid');assert.equal(response.values.description,'  ');assert.equal(reads,0);
 resume=null;assert.equal((await analyzeJobDescription({status:'idle'},data())).status,'no-resume');resume={content:'  '};assert.equal((await analyzeJobDescription({status:'idle'},data())).status,'empty-resume');resume={content:'React'};const success=await analyzeJobDescription({status:'idle'},data());assert.deepEqual(success.analysis,analyzeJobDescriptionAgainstResume(resume.content,values.description));failed=true;const error=await analyzeJobDescription({status:'idle'},data());assert.equal(error.status,'error');assert.deepEqual(error.values,values);failed=false;
});
test('real resume access stays session-scoped and read-only',async()=>{
 queries=[];await getResume();assert.equal(queries.length,1);assert.match(queries[0].sql,/WHERE user_id = \$1/);assert.deepEqual(queries[0].values,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);authenticated=false;await assert.rejects(getResume(),/Authentication/);assert.equal(queries.length,1);authenticated=true;
});
