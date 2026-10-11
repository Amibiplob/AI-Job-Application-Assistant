/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// Test process only: all PostgreSQL access is replaced, never forwarded.
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve(__dirname, '../../package.json'));
const pg = req('pg');
const sessions = new Map([
 ['11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
 ['22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
 ['33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
]);
const populated = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const failed = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const date = new Date('2026-10-01T12:00:00Z');
const jobs = ['SAVED','APPLIED','INTERVIEW','OFFER','REJECTED','WITHDRAWN'].map((status,index)=>({
 id:`10000000-0000-4000-8000-00000000000${index}`, external_id:null,source:index===0?'demo-board-alpha':'fixture-careers',
 title:index===0?'Frontend Developer — sample role':`${status} test opportunity`,company:index===0?'Fictional Studio':'Synthetic Employer',location:'Remote', workplace_type:'REMOTE',employment_type:'Full-time',salary_min:null,salary_max:null,salary_currency:null,salary_period:null,description:'React and TypeScript are required. Git and SQL are useful.',job_url:null,posted_at:date,created_at:date,updated_at:date,
}));
const applications=jobs.map((job,index)=>({...job,id:`20000000-0000-4000-8000-00000000000${index}`, job_id:job.id,status:['SAVED','APPLIED','INTERVIEW','OFFER','REJECTED','WITHDRAWN'][index],applied_at:null,notes:'Synthetic test notes',created_at:new Date(`2026-10-0${6-index}T12:00:00Z`),updated_at:date}));
const resume={id:'30000000-0000-4000-8000-000000000000',name:'Engineering resume',content:'React, TypeScript, and Git experience.',created_at:date,updated_at:date};
const resumeRecords = new Map([[populated, resume]]);
pg.Pool.prototype.query = async function(query,params=[]) {
 const sql=typeof query==='string'?query:query.text;
 let rows=[];
 if(/DELETE FROM sessions/.test(sql)) sessions.delete(params[0]);
 else if(/FROM sessions/.test(sql)) { const uid=sessions.get(params[0]); if(uid) rows=[{id:params[0],user_id:uid,expires_at:new Date('2099-01-01T00:00:00Z')}]; }
 else if(/FROM users/.test(sql)) {if([...sessions.values()].includes(params[0])) rows=[{id:params[0],email:params[0]===populated?'alex@example.test':'new@example.test',name:params[0]===populated?'Alex Morgan':'New Member'}];}
 else if(/INSERT INTO resumes|UPDATE resumes/.test(sql)) { await new Promise(r=>setTimeout(r,600)); const update=/UPDATE/.test(sql); const uid=update?params[3]:params[0]; const name=update?params[0]:params[1]; const content=update?params[1]:params[2]; if(name==='FAIL_SAVE') throw Error('Synthetic write failure'); if(name!=='MISSING_RECORD' && (!update || resumeRecords.get(uid)?.id===params[2])) {const saved={...resume,id:update?params[2]:'40000000-0000-4000-8000-000000000000',name,content};resumeRecords.set(uid,saved); rows=[saved];} }
 else if(/FROM resumes/.test(sql)) {if(params[0]===failed) throw new Error('Synthetic resume read failure'); if(resumeRecords.has(params[0])) rows=[resumeRecords.get(params[0])];}
 else if(/FROM applications AS a/.test(sql)) {if(params[0]===failed) throw new Error('Synthetic application read failure'); if(params[0]===populated) rows=applications;}
 else if(/FROM applications/.test(sql)) {if(params[0]===populated) rows=applications.filter(a=>a.job_id===params[1]);}
 else if(/FROM jobs/.test(sql)) {rows=/WHERE id = \$1/.test(sql)?jobs.filter(j=>j.id===params[0]):jobs;}
 else throw new Error('Fixture query unsupported; live database access blocked.');
 return {rows,rowCount:rows.length};
};
