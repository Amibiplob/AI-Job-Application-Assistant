import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
require('tsx/cjs');
const Module = require('node:module');
const originalLoad = Module._load;
let writes = [], invalidations = [], mode = 'success';
const record = {id:'11111111-1111-4111-8111-111111111111',name:'Saved name',content:'Saved content'};
Module._load = function(id, ...args) {
  if(id === '@/lib/resumes') return {
    createResume: async (...values) => {writes.push(['create',...values]); if(mode==='failure') throw Error('Synthetic failure'); return {...record,name:values[0],content:values[1]};},
    updateResume: async (...values) => {writes.push(['update',...values]); if(mode==='failure') throw Error('Synthetic failure'); if(mode==='missing') return null; return {...record,name:values[1],content:values[2]};},
  };
  if(id === 'next/cache') return {revalidatePath: path => invalidations.push(path)};
  return originalLoad.call(this,id,...args);
};
const {saveResume} = require('../app/dashboard/resume/actions.ts');
Module._load = originalLoad;
const data = (name,content,id) => {const result=new FormData(); result.set('name',name);result.set('content',content);if(id)result.set('resumeId',id);return result;};

test('resume action validates required fields without persistence', async () => {
 writes=[]; invalidations=[];
 const result=await saveResume({},data(' ','\n'));
 assert.deepEqual(Object.keys(result.errors),['name','content']);
 assert.equal(writes.length,0);assert.equal(invalidations.length,0);
});
test('oversized resume inputs return field errors and preserve drafts without writes', async () => {
 writes=[];invalidations=[];
 for(const [name,content,field] of [['x'.repeat(201),'React','name'],['Draft','x'.repeat(50001),'content']]) {
  const result=await saveResume({},data(name,content,record.id));
  assert.ok(result.errors[field]);assert.deepEqual(result.values,{name,content});assert.equal(result.saved,undefined);
 }
 assert.equal(writes.length,0);assert.equal(invalidations.length,0);
});
test('successful create/update preserve existing arguments and return the saved preview', async () => {
 mode='success';writes=[];invalidations=[];
 assert.deepEqual((await saveResume({},data(' New name ','React\nTypeScript'))).saved,{...record,name:'New name',content:'React\nTypeScript'});
 assert.deepEqual(writes[0],['create','New name','React\nTypeScript']);
 assert.deepEqual(invalidations,['/dashboard/resume','/dashboard']);
 await saveResume({},data('Updated','SQL',record.id));
 assert.deepEqual(writes[1],['update',record.id,'Updated','SQL']);
});
test('write failures and missing owned records retain draft without success or invalidation', async () => {
 for(const failure of ['failure','missing']) {
  mode=failure;invalidations=[];
  const result=await saveResume({},data('Draft','Unsaved experience',record.id));
  assert.deepEqual(result.values,{name:'Draft',content:'Unsaved experience'});
  assert.ok(result.message); assert.equal(result.saved,undefined);assert.deepEqual(invalidations,[]);
 }
});
test('workspace renders honest empty and saved states with no invented capabilities', () => {
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const {ResumeEditor}=require('../app/dashboard/resume/resume-editor.tsx');
 const render=resume=>renderToStaticMarkup(React.createElement(ResumeEditor,{resume}));
 const empty=render(null);assert.match(empty,/Start with your experience/);assert.match(empty,/Add your resume/);
 const saved=render(record);assert.match(saved,/Saved name/);assert.match(saved,/Saved content/);assert.match(saved,/Edit resume/);
 assert.doesNotMatch(saved,/Upload|Generate PDF|AI rewrite/);
});
