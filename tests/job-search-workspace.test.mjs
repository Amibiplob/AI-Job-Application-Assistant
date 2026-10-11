import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readJobFilters,pageHref,formatSalary,formatPostedDate} from '../components/jobs/search-presentation.ts';
const require=createRequire(import.meta.url);require('tsx/cjs');
const Module=require('node:module');const originalLoad=Module._load;
let authenticated=true,results=[],failure=false,calls=[],sqlCalls=[];
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='@/lib/db/pool')return {pool:{query:async(sql,values)=>{sqlCalls.push({sql,values});return {rows:[]};}}};
 if(id==='@/lib/auth')return {getCurrentUser:async()=>authenticated?{id:'synthetic-user'}:null};
 if(id==='@/lib/applications')return {getApplicationForJob:async()=>null};
 if(id==='./application-control')return {ApplicationControl:()=>null};
 if(id==='./job-matcher')return {JobMatcher:()=>null};
 if(id==='@/lib/jobs')return {getJobById:async()=>({...job,salaryCurrency:'bad-currency'}),listJobs:async options=>{calls.push(options);if(failure)throw Error('Synthetic error');return results;}};
 if(id==='next/navigation')return {redirect:path=>{throw Object.assign(Error('Redirect'),{path});}};
 return originalLoad.call(this,id,...args);
};
const JobsPage=require('../app/dashboard/jobs/page.tsx').default;
const Details=require('../app/dashboard/jobs/[jobId]/page.tsx').default;
const Loading=require('../app/dashboard/jobs/loading.tsx').default;
const {listJobs}=require('../lib/jobs.ts');
Module._load=originalLoad;
const {renderToStaticMarkup}=require('react-dom/server');
const React=require('react');
const job={id:'11111111-1111-4111-8111-111111111111',title:'Synthetic Developer',company:'Synthetic Employer',source:'demo-board-alpha',location:null,workplaceType:null,employmentType:null,salaryMin:'100',salaryMax:'200',salaryCurrency:null,salaryPeriod:'YEAR',postedAt:null};
const page=params=>JobsPage({searchParams:Promise.resolve(params)});
function reset(){authenticated=true;results=[];failure=false;calls=[];sqlCalls=[];}

test('filters preserve existing normalization and pagination URLs retain search/workplace',()=>{
 assert.deepEqual(readJobFilters({q:'  Engineer  ',workplace:'remote',page:'2'}),{search:'Engineer',workplace:'REMOTE',page:2});
 for(const workplace of ['REMOTE','HYBRID','ONSITE'])assert.equal(readJobFilters({workplace:workplace.toLowerCase()}).workplace,workplace);
 assert.deepEqual(readJobFilters({q:['one','two'],workplace:'unknown',page:'-1'}),{search:'',workplace:'',page:1});
 assert.equal(readJobFilters({q:'x'.repeat(120),page:'999999'}).search.length,100);assert.equal(readJobFilters({page:'999999'}).page,100000);
 const url=new URL(pageHref(3,'R&D / React','HYBRID'),'http://example.test');assert.equal(url.searchParams.get('q'),'R&D / React');assert.equal(url.searchParams.get('workplace'),'HYBRID');assert.equal(url.searchParams.get('page'),'3');
});
test('salary requires meaningful amount, known currency and period; never invents USD',()=>{
 const base={salaryMin:'100.25',salaryMax:'200.50',salaryCurrency:'GBP',salaryPeriod:'YEAR'};
 assert.match(formatSalary(base),/GBP.*100\.25.*200\.50.*year/);
 for(const override of [{salaryCurrency:null},{salaryCurrency:'bad-currency'},{salaryCurrency:'ZZZ'},{salaryPeriod:null},{salaryPeriod:'unknown'},{salaryMin:''},{salaryMin:'NaN'},{salaryMin:'-2'},{salaryMin:'300'},{salaryMin:null,salaryMax:null}])assert.equal(formatSalary({...base,...override}),null,JSON.stringify(override));
 assert.match(formatSalary({...base,salaryMin:null}),/^Up to/);assert.match(formatSalary({...base,salaryMax:null}),/^From/);
 assert.equal(formatPostedDate(new Date('2026-10-01T23:59:00-05:00')),'2 Oct 2026');assert.equal(formatPostedDate(new Date('bad')),null);assert.equal(formatPostedDate(null),null);
});
test('real listJobs keeps parameterized title/company ILIKE, workplace and ordering semantics',async()=>{
 reset();await listJobs({search:" React%_' ",workplaceType:'REMOTE',limit:11,offset:10});
 assert.deepEqual(sqlCalls[0].values,['REMOTE',"%React%_'%",11,10]);assert.match(sqlCalls[0].sql,/workplace_type = \$1::workplace_type/);assert.match(sqlCalls[0].sql,/title ILIKE \$2 OR company ILIKE \$2/);assert.match(sqlCalls[0].sql,/ORDER BY posted_at DESC NULLS LAST, created_at DESC, id DESC/);
});
test('page guards authorization before any search reads',async()=>{
 reset();authenticated=false;await assert.rejects(page({}),error=>error.path==='/login');assert.equal(calls.length,0);
});
test('out-of-range results recover to first page with filters while failures never redirect',async()=>{
 reset();await assert.rejects(page({q:'React',workplace:'hybrid',page:'20'}),error=>error.path===pageHref(1,'React','HYBRID'));
 assert.deepEqual(calls[0],{limit:11,offset:190,search:'React',workplaceType:'HYBRID'});
 failure=true;const html=renderToStaticMarkup(await page({page:'20',q:'React'}));assert.match(html,/couldn’t load jobs/);assert.match(html,/Reload these results/);assert.match(html,/role="alert"/);
});
test('populated, empty and loading states are truthful, labelled and semantic',async()=>{
 reset();let html=renderToStaticMarkup(await page({}));assert.match(html,/No listings available yet/);
 html=renderToStaticMarkup(await page({q:'missing'}));assert.match(html,/No matching listings/);assert.match(html,/Clear filters/);
 results=Array.from({length:11},(_,index)=>({...job,id:String(index),source:index===0?'demo-board-alpha':'company-careers'}));
 html=renderToStaticMarkup(await page({q:'Synthetic',workplace:'REMOTE',page:'2'}));assert.match(html,/Showing 11–20 listings/);assert.match(html,/Demo listing/);assert.match(html,/Unverified listing/);assert.match(html,/Not available/);assert.doesNotMatch(html,/USD/);assert.match(html,/page=1/);assert.match(html,/page=3/);assert.equal((html.match(/<article/g)||[]).length,10);assert.doesNotMatch(html,/<main|<button[^>]*>(?:(?!<\/button>).)*<a/s);
 html=renderToStaticMarkup(React.createElement(Loading));assert.match(html,/Loading job results/);assert.match(html,/aria-busy="true"/);assert.match(html,/motion-reduce:animate-none/);
});

test('shared details presentation does not crash on malformed salary currency and retains provenance',async()=>{
 reset();const html=renderToStaticMarkup(await Details({params:Promise.resolve({jobId:job.id})}));assert.match(html,/Demo listing/);assert.doesNotMatch(html,/USD|bad-currency/);
});
