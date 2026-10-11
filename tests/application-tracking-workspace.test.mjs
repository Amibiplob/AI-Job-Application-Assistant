import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('tsx/cjs');
const Module=require('node:module');const original=Module._load;
let authenticated=true,records=[],failed=false,result='updated',calls=[],sqlCalls=[];
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='@/lib/auth')return {getCurrentUser:async()=>authenticated?{id:'synthetic'}:null,getSession:async()=>authenticated?{userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}:null};
 if(id==='@/lib/applications')return {listApplications:async()=>{calls.push('read');if(failed)throw Error('Synthetic');return records;},updateApplication:async input=>{calls.push(input);if(result==='throw')throw Error('Synthetic');return result;}};
 if(id==='@/lib/db/pool')return {pool:{query:async(sql,values)=>{sqlCalls.push({sql,values});return {rows:[],rowCount:0};}}};
 if(id==='next/navigation')return {redirect:path=>{throw Object.assign(Error('Redirect'),{path});}};
 if(id==='next/cache')return {revalidatePath:path=>calls.push(path)};
 return original.call(this,id,...args);
};
const Page=require('../app/dashboard/applications/page.tsx').default;
const {saveApplication}=require('../app/dashboard/applications/actions.ts');
const {updateApplication,listApplications}=require('../lib/applications.ts');
const {applicationCounts,applicationDate}=require('../components/jobs/application-presentation.ts');
const {APPLICATION_STATUSES}=require('../lib/application-validation.ts');
Module._load=original;
const {renderToStaticMarkup}=require('react-dom/server');
const base={id:'20000000-0000-4000-8000-000000000000',jobId:'10000000-0000-4000-8000-000000000000',status:'SAVED',notes:'First line\nSecond line',appliedAt:new Date('2026-10-01T12:00:00Z'),createdAt:new Date('2026-10-01'),updatedAt:new Date('2026-10-01'),job:{title:'Synthetic opportunity',company:'Synthetic employer',source:'demo-board-alpha',location:null,workplaceType:null,employmentType:null,salaryMin:null,salaryMax:null,salaryCurrency:null,salaryPeriod:null,postedAt:null}};
const page=async status=>renderToStaticMarkup(await Page({searchParams:Promise.resolve({status})}));
test('empty, populated, provenance, notes and UTC dates stay truthful',async()=>{
 records=[];assert.match(await page(),/Start your application tracker/);records=[base,{...base,id:'20000000-0000-4000-8000-000000000001',job:{...base.job,source:'careers'},appliedAt:null}];const html=await page();assert.match(html,/Demo listing/);assert.match(html,/Unverified listing/);assert.match(html,/First line/);assert.match(html,/1 Oct 2026/);assert.match(html,/Not recorded/);assert.match(html,/does not submit an application/);assert.equal(applicationDate(new Date('invalid')),'');
});
test('all persisted statuses and filters have accurate counts, including Withdrawn',async()=>{
 records=APPLICATION_STATUSES.map((status,index)=>({...base,id:`20000000-0000-4000-8000-00000000000${index}`,status}));const counts=applicationCounts(records);for(const status of APPLICATION_STATUSES){assert.equal(counts[status],1);const html=await page(status);assert.equal((html.match(/<form /g)||[]).length,1);assert.match(html,/aria-current="page"/);}assert.equal((await page('invalid')).match(/<form /g).length,6);records=[base];assert.match(await page('OFFER'),/No offer applications/);
});
test('route and action guard authentication before data access, read failures never show fake zero counts',async()=>{
 calls=[];authenticated=false;await assert.rejects(page(),error=>error.path==='/login');await assert.rejects(saveApplication({status:'idle'},new FormData()),error=>error.path==='/login');assert.deepEqual(calls,[]);authenticated=true;failed=true;const html=await page();assert.match(html,/We couldn’t load/);assert.doesNotMatch(html,/Total tracked applications/);failed=false;
});
test('existing action preserves submitted input and existing validation/not-found/error outcomes',async()=>{
 const data=new FormData();for(const [key,value] of Object.entries({applicationId:base.id,status:'APPLIED',notes:' draft ',appliedAt:'2026-10-01'}))data.set(key,value);
 for(const outcome of ['updated','invalid-input','not-found','throw']){result=outcome;const response=await saveApplication({status:'idle'},data);assert.equal(response.status,outcome==='updated'?'success':'error');assert.deepEqual(calls.findLast(value=>typeof value==='object'),{applicationId:base.id,status:'APPLIED',notes:' draft ',appliedAt:'2026-10-01'});}
});
test('real persistence retains user-scoped queries, validation and explicit applied dates',async()=>{
 sqlCalls=[];await listApplications();assert.match(sqlCalls[0].sql,/WHERE a.user_id = \$1/);assert.deepEqual(sqlCalls[0].values,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
 assert.equal(await updateApplication({applicationId:base.id,status:'BAD',notes:'',appliedAt:''}),'invalid-input');assert.equal(sqlCalls.length,1);
 await updateApplication({applicationId:base.id,status:'SAVED',notes:' note ',appliedAt:''});const write=sqlCalls[1];assert.match(write.sql,/WHERE id = \$4 AND user_id = \$5/);assert.deepEqual(write.values,['SAVED','note',null,base.id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});
