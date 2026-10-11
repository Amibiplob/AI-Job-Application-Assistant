/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// All PostgreSQL queries are intercepted by this fixture or its synthetic base.
require('./resume-fixtures.cjs');
const pg=require('pg');const previous=pg.Pool.prototype.query;
const emptyUser='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
pg.Pool.prototype.query=async function(query,params=[]){
 const sql=typeof query==='string'?query:query.text;
 if(/FROM sessions/.test(sql)&&params[0]==='44444444-4444-4444-8444-444444444444')return {rows:[{id:params[0],user_id:emptyUser,expires_at:new Date('2099-01-01T00:00:00Z')}],rowCount:1};
 if(/FROM users/.test(sql)&&params[0]===emptyUser)return {rows:[{id:emptyUser,name:'Synthetic empty resume',email:'empty@example.test'}],rowCount:1};
 if(/FROM resumes/.test(sql)){
  await new Promise(resolve=>setTimeout(resolve,500));
  if(params[0]===emptyUser)return {rows:[{id:'30000000-0000-4000-8000-000000000000',name:'Empty test resume',content:'  ',created_at:new Date('2026-10-01'),updated_at:new Date('2026-10-01')}],rowCount:1};
 }
 return previous.call(this,query,params);
};
