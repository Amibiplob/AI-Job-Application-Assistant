import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {safeOriginalListingUrl} from '../components/jobs/details-presentation.ts';
import {matchResumeToJob} from '../lib/job-matching.ts';
const require=createRequire(import.meta.url);require('tsx/cjs');
const Module=require('node:module');const original=Module._load;
let authenticated=true,job=null,resume=null,queryFailed=false,trackingMode='added',reads=[],sqlCalls=[];
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='@/lib/auth')return {getCurrentUser:async()=>authenticated?{id:'synthetic-user'}:null,getSession:async()=>authenticated?{userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}:null};
 if(id==='@/lib/jobs')return {getJobById:async()=>{reads.push('job');if(queryFailed)throw Error('Synthetic read failure');return job;}};
 if(id==='@/lib/resumes')return {getResume:async()=>{reads.push('resume');return resume;}};
 if(id==='@/lib/applications')return {getApplicationForJob:async()=>{reads.push('application');return null;},addApplication:async id=>{reads.push(id);if(trackingMode==='error')throw Error('Synthetic tracking failure');return {status:trackingMode,application:{status:'SAVED'}};}};
 if(id==='@/lib/db/pool')return {pool:{query:async(sql,values)=>{sqlCalls.push({sql,values});return {rows:[],rowCount:0};}}};
 if(id==='next/navigation')return {redirect:path=>{throw Object.assign(Error('Redirect'),{path});},notFound:()=>{throw Object.assign(Error('Not found'),{notFound:true});}};
 return original.call(this,id,...args);
};
const Page=require('../app/dashboard/jobs/[jobId]/page.tsx').default;
const NotFound=require('../app/dashboard/jobs/[jobId]/not-found.tsx').default;
const ErrorPage=require('../app/dashboard/jobs/[jobId]/error.tsx').default;
const Matcher=require('../app/dashboard/jobs/[jobId]/job-matcher.tsx').JobMatcher;
const Tracking=require('../app/dashboard/jobs/[jobId]/application-control.tsx').ApplicationControl;
const Summary=require('../components/jobs/job-match-summary.tsx').JobMatchSummary;
const {matchJobWithResume}=require('../app/dashboard/jobs/[jobId]/actions.ts');
const {addJobToApplications}=require('../app/dashboard/jobs/[jobId]/application-actions.ts');
const {getApplicationForJob,addApplication}=require('../lib/applications.ts');
Module._load=original;
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const baseline={id:'50000000-0000-4000-8000-000000000001',title:'Synthetic Developer',company:'Synthetic Employer',source:'demo-board-alpha',location:null,workplaceType:null,employmentType:null,salaryMin:'100',salaryMax:'200',salaryCurrency:null,salaryPeriod:'YEAR',postedAt:null,jobUrl:null,description:null};
const data=()=>{const form=new FormData();form.set('jobId',baseline.id);return form;};
function reset(){authenticated=true;job={...baseline};resume=null;queryFailed=false;trackingMode='added';reads=[];sqlCalls=[];}
const page=()=>Page({params:Promise.resolve({jobId:baseline.id})});

test('original listing URLs allow HTTP(S) and reject dangerous, malformed and credential-bearing URLs',()=>{
 for(const url of [null,'','javascript:alert(1)','data:text/html,test','file:///tmp/file','ftp://example.test','//example.test','https://user:password@example.test','not a url'])assert.equal(safeOriginalListingUrl(url),null);
 assert.equal(safeOriginalListingUrl('https://example.test/jobs/1'),'https://example.test/jobs/1');assert.equal(safeOriginalListingUrl('http://example.test'),'http://example.test/');
});
test('nullable metadata and missing description stay truthful; descriptions are escaped text',async()=>{
 reset();let html=renderToStaticMarkup(await page());assert.match(html,/No description available/);assert.match(html,/Demo listing/);assert.match(html,/Not provided/);assert.doesNotMatch(html,/USD|View original listing|<time/);
 job={...baseline,source:'company-careers',jobUrl:'https://example.test/jobs/1',salaryCurrency:'bad-currency',description:'React\n\n<script>alert(1)</script>'};html=renderToStaticMarkup(await page());assert.match(html,/Unverified listing/);assert.match(html,/View original listing/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|bad-currency/);
 job.jobUrl='javascript:alert(1)';html=renderToStaticMarkup(await page());assert.doesNotMatch(html,/href="javascript:/);
});
test('score presentation distinguishes real zero overlap from unscorable text',()=>{
 const recognized=render(Summary,{result:matchResumeToJob('React','React TypeScript SQL Git')});assert.match(recognized,/25%/);assert.match(recognized,/Recognized-skill text overlap/);assert.match(recognized,/not a hiring probability/);assert.match(recognized,/Job skills not detected in your resume/);
 const unscored=render(Summary,{result:matchResumeToJob('React','No technical vocabulary here')});assert.match(unscored,/Not scored/);assert.doesNotMatch(unscored,/0%/);
 assert.match(render(Summary,{result:matchResumeToJob('React','SQL')}),/0%/);
});
test('missing description, tracked status, missing-job and error presentation has supported navigation',()=>{
 assert.match(render(Matcher,{jobId:baseline.id,hasDescription:false}),/No description was provided/);
 assert.doesNotMatch(render(Matcher,{jobId:baseline.id,hasDescription:false}),/<form/);
 const tracked=render(Tracking,{jobId:baseline.id,initialStatus:'INTERVIEW'});assert.match(tracked,/Interview/);assert.match(tracked,/does not submit an application/);assert.match(tracked,/href="\/dashboard\/applications"/);assert.doesNotMatch(tracked,/Add to tracking/);
 assert.match(render(NotFound),/href="\/dashboard\/jobs"/);assert.match(render(ErrorPage,{error:Error('Synthetic'),retry:()=>{}}),/Try again/);
});
test('page and both existing actions authorize before reads or writes; missing jobs and errors remain distinct',async()=>{
 reset();authenticated=false;for(const action of [page,()=>matchJobWithResume({status:'idle'},data()),()=>addJobToApplications({status:'idle'},data())])await assert.rejects(action(),error=>error.path==='/login');assert.deepEqual(reads,[]);
 authenticated=true;job=null;await assert.rejects(page(),error=>error.notFound);queryFailed=true;await assert.rejects(page(),/Synthetic read failure/);
});
test('existing matching and tracking actions retain input, missing-resume and success/failure behavior',async()=>{
 reset();assert.equal((await matchJobWithResume({status:'idle'},data())).status,'no-resume');
 resume={content:'React TypeScript Git'};job.description='React TypeScript Git SQL';const result=await matchJobWithResume({status:'idle'},data());assert.deepEqual(result.result,matchResumeToJob(resume.content,job.description));assert.equal(result.result.score,75);
 for(const status of ['added','already-tracked','job-not-found','error']){trackingMode=status;assert.equal((await addJobToApplications({status:'idle'},data())).status,status);}
});
test('real tracking reads/writes remain scoped to the active session user',async()=>{
 reset();await getApplicationForJob(baseline.id);assert.match(sqlCalls[0].sql,/WHERE user_id = \$1 AND job_id = \$2/);assert.deepEqual(sqlCalls[0].values,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',baseline.id]);
 await addApplication(baseline.id);const write=sqlCalls.find(call=>call.sql.includes('INSERT INTO applications'));assert.ok(write);assert.deepEqual(write.values,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',baseline.id]);assert.match(write.sql,/ON CONFLICT \(user_id, job_id\) DO NOTHING/);
});
test('job details action and summary share expanded alias recognition and scoring',async()=>{
 reset();resume={content:'NextJS NodeJS WAI-ARIA Vitest'};
 job.description='Next.js Node JS ARIA Vitest Angular WCAG 2.2';
 const state=await matchJobWithResume({status:'idle'},data());
 assert.equal(state.status,'success');assert.equal(state.result.score,67);
 assert.deepEqual(state.result.matchingSkills,['ARIA','Next.js','Node.js','Vitest']);
 assert.deepEqual(state.result.jobSkillsNotDetected,['Angular','WCAG']);
 const html=render(Summary,{result:state.result});
 assert.match(html,/67%/);assert.match(html,/4 of 6 recognized job skills/);
 assert.match(html,/not a hiring probability/);
});
