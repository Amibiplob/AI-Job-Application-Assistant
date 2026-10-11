/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// Isolated synthetic data only. The previous fixture also intercepts every query.
require('./job-search-fixtures.cjs');
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve(__dirname,'../../package.json'));
const pg=req('pg');const previous=pg.Pool.prototype.query;
const tracked=new Map();
const date=new Date('2026-10-01T12:00:00Z');
const prefix='50000000-0000-4000-8000-';
let failedRead=false;
pg.Pool.prototype.query=async function(query,params=[]){
 const sql=typeof query==='string'?query:query.text;
 if(/INSERT INTO applications/.test(sql)){
  await new Promise(resolve=>setTimeout(resolve,500));
  if(params[1]===prefix+'000000000002')throw Error('Synthetic tracking failure');
  const key=params[0]+':'+params[1];let rows=[];
  if(!tracked.has(key)){const row={id:'60000000-0000-4000-8000-000000000000',job_id:params[1],status:'SAVED',applied_at:null,notes:null,created_at:date,updated_at:date};tracked.set(key,row);rows=[row];}return {rows,rowCount:rows.length};
 }
 if(/FROM applications/.test(sql)&&!/AS a/.test(sql)){const row=tracked.get(params[0]+':'+params[1]);return {rows:row?[row]:[],rowCount:row?1:0};}
 if(/FROM jobs/.test(sql)&&/WHERE id = \$1/.test(sql)){
  if(params[0]===prefix+'000000000901'&&!failedRead){failedRead=true;throw Error('Synthetic detail read failure');}
  const result=await previous.call(this,query,params[0]===prefix+'000000000901'?[prefix+'000000000005']:params);
  result.rows=result.rows.map(row=>({...row,id:params[0]===prefix+'000000000901'?params[0]:row.id,company:params[0]===prefix+'000000000000'?'Synthetic Employer '+ 'LongCompany'.repeat(24):row.company,description:params[0]===prefix+'000000000003'?null:params[0]===prefix+'000000000004'?'A thoughtful opportunity with no technical dictionary terms.':'React TypeScript Git SQL\n\nResponsibilities: review requirements and work with the team.\n\n'+ 'LongDescription'.repeat(40),job_url:params[0]===prefix+'000000000002'?'javascript:alert(1)':params[0]===prefix+'000000000001'?'https://example.test/jobs/sample':null}));return result;
 }
 return previous.call(this,query,params);
};
