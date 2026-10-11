/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must use CommonJS. */
// Isolated test process only. No queries are forwarded to a real database.
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve(__dirname,'../../package.json'));
const pg=req('pg');
const argon2=req('argon2');
const valid='11111111-1111-4111-8111-111111111111';
const expired='22222222-2222-4222-8222-222222222222';
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const users=new Map();
const sessions=new Map([
 [valid,{id:valid,user_id:userId,expires_at:new Date('2099-01-01')}],
 [expired,{id:expired,user_id:userId,expires_at:new Date('2000-01-01')}],
]);
const ready=argon2.hash('Synthetic-pass-123!',{type:argon2.argon2id}).then(hash=>users.set(userId,{id:userId,name:'Synthetic Member',email:'member@example.test',password_hash:hash}));
pg.Pool.prototype.query=async function(query,params=[]){
 await ready;
 const sql=typeof query==='string'?query:query.text;
 let rows=[];
 if(/SELECT id, user_id, expires_at/.test(sql)){const row=sessions.get(params[0]);if(row&&row.expires_at>new Date())rows=[row];}
 else if(/INSERT INTO sessions/.test(sql))sessions.set(params[0],{id:params[0],user_id:params[1],expires_at:params[2]});
 else if(/DELETE FROM sessions/.test(sql))sessions.delete(params[0]);
 else if(/INSERT INTO users/.test(sql)){const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';users.set(id,{id,name:params[0],email:params[1],password_hash:params[2]});rows=[{id}];}
 else if(/DELETE FROM users/.test(sql))users.delete(params[0]);
 else if(/FROM users/.test(sql)){const row=/WHERE email/.test(sql)?[...users.values()].find(user=>user.email===params[0]):users.get(params[0]);if(row)rows=[row];}
 else if(/FROM resumes|FROM applications/.test(sql))rows=[];
 else throw Error('Unsupported fixture query; real database access blocked.');
 return {rows,rowCount:rows.length};
};
