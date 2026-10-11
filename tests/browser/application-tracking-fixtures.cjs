/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// All queries are intercepted by this fixture or the synthetic base; never forwarded.
require('./resume-fixtures.cjs');
const pg=require('pg');const previous=pg.Pool.prototype.query;
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let records;
pg.Pool.prototype.query=async function(query,params=[]){
 const sql=typeof query==='string'?query:query.text;
 if(/FROM applications AS a/.test(sql)&&params[0]===owner){
  if(!records){records=(await previous.call(this,query,params)).rows.map((row,index)=>({...row,title:index===0?'Synthetic opportunity '+ 'LongTitle'.repeat(20):row.title,company:index===0?'LongCompany'.repeat(20):row.company,notes:index===0?'First line\n\n'+ 'LongNote'.repeat(80):row.notes,applied_at:index===1?new Date('2026-09-30T12:00:00Z'):null}));}return {rows:records,rowCount:records.length};
 }
 if(/UPDATE applications/.test(sql)){
  await new Promise(resolve=>setTimeout(resolve,500));
  if(params[1]==='FAIL_SAVE')throw Error('Synthetic save failure');
  const row=params[4]===owner?records?.find(row=>row.id===params[3]):null;
  if(row){row.status=params[0];row.notes=params[1];row.applied_at=params[2];}
  return {rows:row?[{id:row.id}]:[],rowCount:row?1:0};
 }
 return previous.call(this,query,params);
};
