/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// Reuse isolated synthetic accounts; every query remains intercepted, never forwarded.
require('./resume-fixtures.cjs');
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve(__dirname,'../../package.json'));
const pg=req('pg');const previous=pg.Pool.prototype.query;
const date=new Date('2026-10-01T12:00:00Z');
const jobs=Array.from({length:33},(_,index)=>({
 id:`50000000-0000-4000-8000-${String(index).padStart(12,'0')}`,external_id:null,source:index%2?'company-careers':'demo-board-alpha',title:index===0?'Synthetic Developer '+ 'LongTitle'.repeat(35):'Synthetic Developer '+index,company:'Synthetic Employer',location:index%3?'Remote markets':null,workplace_type:index<23?'REMOTE':index%2?'HYBRID':'ONSITE',employment_type:index%2?'Full-time':null,salary_min:index%4?'75000':null,salary_max:index%4?'95000':null,salary_currency:index%4===1?'GBP':index%4===2?'bad-currency':null,salary_period:index%5?'YEAR':null,posted_at:index%2?date:null,description:'Synthetic React and SQL opportunity.',job_url:null,created_at:date,updated_at:date,
}));
pg.Pool.prototype.query=async function(query,params=[]){
 const sql=typeof query==='string'?query:query.text;
 if(!/FROM jobs/.test(sql))return previous.call(this,query,params);
 if(/WHERE id = \$1/.test(sql)){const rows=jobs.filter(job=>job.id===params[0]);return {rows,rowCount:rows.length};}
 const search=params.find(value=>typeof value==='string'&&value.startsWith('%'));
 if(search?.includes('FAIL_QUERY'))throw Error('Synthetic search failure');
 if(search?.includes('SLOW_QUERY'))await new Promise(resolve=>setTimeout(resolve,2500));
 const workplace=params.find(value=>['REMOTE','HYBRID','ONSITE'].includes(value));
 const pattern=search?new RegExp('^'+search.split('').map(char=>char==='%'?'.*':char==='_'?'.':char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$','i'):null;
 const matches=jobs.filter(job=>(!workplace||job.workplace_type===workplace)&&(!pattern||pattern.test(job.title)||pattern.test(job.company)));
 const rows=matches.slice(params.at(-1),params.at(-1)+params.at(-2));return {rows,rowCount:rows.length};
};
