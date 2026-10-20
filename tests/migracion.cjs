const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),cp=require('child_process');
const oldHtml=cp.execFileSync('git',['show','HEAD:index.html'],{encoding:'utf8'}),newHtml=fs.readFileSync('index.html','utf8');
function harness(html,initial=new Map()){
 const storage=new Map(initial),elements=new Map(),events={},blobs=[];
 function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',files:[],scrollLeft:0,scrollWidth:300,clientWidth:300,attributes:{},classList:{add(){},remove(){}},querySelectorAll(){return[]},addEventListener(k,f){events[id+':'+k]=f},setAttribute(k,v){this.attributes[k]=String(v)},click(){}});return elements.get(id)}
 const context=vm.createContext({console,Date,Math,JSON,Number,String,Boolean,Object,Array,Set,Map,Intl,Error,Blob,URL:{createObjectURL(blob){blobs.push(blob);return'blob:test'},revokeObjectURL(){}},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},confirm:()=>true,navigator:{},window:{scrollTo(){},addEventListener(){}},document:{getElementById:element,addEventListener(k,f){events[k]=f},createElement:()=>element('anchor')},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 const run=s=>vm.runInContext(s,context);run(html.split('<script>')[1].split('</script>')[0]);return{storage,context,run,element,blobs,events};
}
const plain=x=>JSON.parse(JSON.stringify(x));
const old=harness(oldHtml);
// Generate historical data through the old app's own edit/save functions.
old.run(`localStorage.setItem(STORAGE_KEY,'[]');for(const [j,date] of ['2026-01-03','2026-05-17','2026-10-19'].entries()){
 load(date);updateSetting('bodyweight',77.3+j*1.4);updateSetting('workoutTime',45+j*7);
 for(let i=0;i<currentSession.exercises.length;i++){
  go('train',i);if((i+j)%2===0)changeUnit(currentSession.exerciseConfigs[currentSession.exercises[i].name].unit==='kg'?'lbs':'kg');
  updateConfig('fiveRM',100+i*7+j);updateConfig('rom',.25+i*.03+j*.01);addSet();
  updateSet(0,'sets',2+j);updateSet(0,'reps',5+i%3);updateSet(0,'weight',ASSISTED.includes(currentSession.exercises[i].name)?-20:20+i*3+j);
  repeatSet();updateSet(1,'weight',ASSISTED.includes(currentSession.exercises[i].name)?-15:15+i*2+j);
 }save();}setRest(135);`);
const key=old.run('STORAGE_KEY'),raw=old.storage.get(key),before=JSON.parse(raw);
assert.equal(before.length,3);assert.equal(old.run('Object.keys(EXERCISES).length'),10);
const fresh=harness(newHtml,old.storage);
assert.ok(!fresh.element('app').innerHTML.includes('Datos protegidos'));
assert.deepEqual(plain(fresh.run('EXERCISES')),plain(old.run('EXERCISES')));
assert.equal(fresh.storage.get('workoutRestBruno'),'135');
const migrated=plain(fresh.run('sessions()'));
assert.deepEqual(migrated.map(s=>s.date),before.map(s=>s.date));
for(const prior of before){const next=migrated.find(s=>s.date===prior.date);
 assert.equal(next.bodyweight,prior.bodyweight);assert.equal(next.workoutTime,prior.workoutTime);assert.deepEqual(next.exercises,prior.exercises);
 for(const [name,c]of Object.entries(prior.exerciseConfigs))for(const k of Object.keys(c))assert.deepEqual(next.exerciseConfigs[name][k],c[k]);
}
const backup=JSON.parse(fresh.storage.get(key+'_respaldo_v2'));assert.equal(backup.rawSessions,raw);assert.deepEqual(backup.sessions,before);
const report=[];let forceDelta=0,workDelta=0;
for(const prior of before){old.context.fixture=prior;fresh.context.fixture=migrated.find(s=>s.date===prior.date);
 const a=plain(old.run('fixture.exercises.map(e=>exStats(e,fixture))')),b=plain(fresh.run('fixture.exercises.map(e=>exStats(e,fixture))'));
 let df=0,dw=0;
 prior.exercises.forEach((ex,i)=>{const base=old.run('EXERCISES')[ex.name],config=prior.exerciseConfigs[ex.name],bar=base.usesBodyweight?0:base.barWeight||0,n=a[i].totalReps;
 const close=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${ex.name}: ${x} != ${y}`);
 close(b[i].volume,a[i].volume);close(b[i].totalReps,a[i].totalReps);close(b[i].totalSets,a[i].totalSets);close(b[i].oneRM,a[i].oneRM);
 close(a[i].force-b[i].force,bar*9.8*n);close(a[i].work-b[i].work,bar*9.8*n*config.rom);
 close(a[i].maxTotalWeight-b[i].maxTotalWeight,bar);close(a[i].intensity-b[i].intensity,bar/a[i].oneRM*100);
 df+=a[i].force-b[i].force;dw+=a[i].work-b[i].work;
 });
 const ot=plain(old.run('totals(fixture)')),nt=plain(fresh.run('totals(fixture)'));
 assert.ok(Math.abs(ot.watts-nt.watts-dw/(prior.workoutTime*60))<1e-8);
 report.push({date:prior.date,volume:nt.volume,forceRemovedN:df,workRemovedJ:dw,powerRemovedW:ot.watts-nt.watts,legacyIntensityRemovedPP:ot.intensity-nt.intensity});forceDelta+=df;workDelta+=dw;
}
// Actual Blob export, then actual file-input import handler in an empty installation.
(async()=>{
 fresh.run('exportData()');assert.equal(fresh.element('anchor').download.startsWith('entrenamiento_bruno_'),true);
 const exported=JSON.parse(await fresh.blobs[0].text()),dest=harness(newHtml);
 dest.context.FileReader=class{readAsText(){this.result=JSON.stringify(exported);this.onload()}};
 dest.run(`importFile.value='fixture';`);dest.element('importFile');
 // Trigger the same registered change callback used by Safari's file picker.
 dest.events['importFile:change']({target:{files:[{name:'bruno.json'}],value:'fixture'}});
 assert.deepEqual(plain(dest.run('sessions()')),exported.sessions);assert.deepEqual(plain(dest.run('cycles()')),exported.cycles);
 assert.deepEqual(plain(fresh.run('exportPayload()')),exported);
 for(const screen of ['session','history','settings','cycles']){fresh.run(`go('${screen}')`);if(screen==='history')assert.equal((fresh.element('app').innerHTML.match(/class="bw-card history-metric"/g)||[]).length,9)}
 for(let i=0;i<10;i++)fresh.run(`go('train',${i});parametersOpen=true;renderTrain()`);
 // Editable bodyweight and total 5RM, including subtractive assistance.
 fresh.run(`go('train',3);parametersOpen=true;updateConfig('usesBodyweight',true);currentSession.exercises[3].sets=[{sets:2,reps:5,weight:-20}];save()`);
 assert.ok(Math.abs(fresh.run('exStats(currentSession.exercises[3]).volume')-(fresh.run('currentSession.bodyweight')-fresh.run("kg(20,currentSession.exerciseConfigs[currentSession.exercises[3].name].unit)"))*10)<1e-8);
 assert.ok(fresh.element('app').innerHTML.includes('5RM total (cuerpo + lastre)'));
 // Corruption and backup quota block every overwrite.
 for(const damaged of ['{broken','{}','[null]','[{"date":"2026-01-01","exercises":"broken"}]']){
 const broken=harness(newHtml,new Map([[key,damaged]]));assert.equal(broken.storage.get(key),damaged);assert.ok(broken.element('app').innerHTML.includes('Datos protegidos'));broken.run('save()');assert.equal(broken.storage.get(key),damaged);
 }
 const quota=harness(newHtml);quota.storage.set(key,raw);const setter=quota.context.localStorage.setItem;quota.context.localStorage.setItem=(k,v)=>{if(k===key+'_respaldo_v2')throw Error('quota');setter(k,v)};
 assert.throws(()=>quota.run('migrate()'));assert.equal(quota.storage.get(key),raw);
 const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8')),oldManifest=JSON.parse(cp.execFileSync('git',['show','HEAD:manifest.json'],{encoding:'utf8'}));assert.equal(manifest.id,oldManifest.id);assert.deepEqual(manifest.icons,oldManifest.icons);
 assert.ok(!/AndroidBridge|androidBack|fonts.googleapis|fonts.gstatic/.test(newHtml));assert.ok(newHtml.includes("register('./sw.js?v=7')"));
 const sw=fs.readFileSync('sw.js','utf8');assert.ok(sw.includes('bruno-workout-v7'));for(const file of fs.readdirSync('fonts'))assert.ok(sw.includes('./fonts/'+file));
 console.log('PASS migración real HEAD → v2: 3 fechas, 10 ejercicios, kg/lbs, 5RM/ROM, peso/duración, respaldo exacto, Blob, ida/vuelta, pantallas, corrupción y cuota.');
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

// Regression suite ported with exercise names and storage keys adapted to Bruno.
(function regression(){
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),source=html.split('<script>')[1].split('</script>')[0];
const elements=new Map(),listeners={},storage=new Map(),documentListeners={};
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',files:[],scrollLeft:0,scrollWidth:300,clientWidth:300,querySelectorAll(){return []},classList:{add(){},remove(){}},addEventListener(event,fn){listeners[id+':'+event]=fn},attributes:{},setAttribute(k,v){this.attributes[k]=String(v)},click(){}});return elements.get(id)}
const context=vm.createContext({console,Date,Math,JSON,Number,String,Boolean,Object,Array,Set,Map,Intl,Error,Blob,URL,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},confirm:()=>true,navigator:{},window:{scrollTo(){}},document:{getElementById:element,addEventListener(type,fn){documentListeners[type]=fn},createElement:()=>element('anchor')},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
const old=[{date:'2026-10-01',bodyweight:80,workoutTime:60,custom:{keep:true},exercises:[{name:'Peso Muerto',extra:'keep exercise',sets:[{sets:1,reps:5,weight:80,tag:'primera'},{sets:1,reps:5,weight:72}]}],exerciseConfigs:{'Peso Muerto':{fiveRM:100,rom:.46,unit:'kg',usesBodyweight:false,extra:'keep config'}}},{date:'2026-10-02',bodyweight:81,workoutTime:50,exercises:[{name:'Pull Ups',sets:[{sets:2,reps:5,weight:0}]}],exerciseConfigs:{'Pull Ups':{fiveRM:100,rom:.5,unit:'kg',usesBodyweight:true}}},{date:'2026-10-03',bodyweight:80,workoutTime:60,exercises:[],exerciseConfigs:{}}];
storage.set('workoutSessions',JSON.stringify(old));vm.runInContext(source,context);const run=s=>vm.runInContext(s,context),plain=value=>JSON.parse(JSON.stringify(value));
function originalFields(a,b){for(const k of Object.keys(a)){if(a[k]&&typeof a[k]==='object')originalFields(a[k],b[k]);else assert.equal(b[k],a[k],k)}}
const migrated=JSON.parse(storage.get('workoutSessions'));assert.equal(migrated.length,3);old.forEach((s,i)=>originalFields(s,migrated[i]));assert.deepEqual(JSON.parse(storage.get('workoutSessions_respaldo_v2')).sessions,old);
const s=migrated[0].summary;assert.equal(s.totalSets,2);assert.equal(s.totalReps,10);assert.equal(s.volumeLoadKgReps,760);assert.equal(s.meanLoadKgPerRep,76);assert.ok(Math.abs(s.meanRelativeIntensityPct-67.5488)<1e-8);assert.equal(s.intensityCoveragePctReps,100);assert.ok(Math.abs(s.estimatedConcentricWorkJ-3426.08)<1e-8);assert.equal(migrated[1].summary.volumeLoadKgReps,810);assert.equal(migrated[2].summary.totalSets,0);assert.equal(migrated[2].summary.meanRelativeIntensityPct,null);
run(`load('2026-10-01');save();go('history')`);old[0]&&originalFields(old[0],JSON.parse(storage.get('workoutSessions')).find(s=>s.date===old[0].date));assert.ok(!element('app').innerHTML.includes("openHistory('2026-10-03')"));
run(`newCycle();cycleDraft.name='Prueba Pavel';cycleDraft.startDate='2026-10-10';cycleDraft.weeks=4;cycleDraft.sessionsPerWeek=2;selectCycleExercise('Peso Muerto',true);Object.assign(cycleDraft.progression['Peso Muerto'],{initialTopKg:80,incrementKg:2.5,backoffRatio:.9});generatePlan(cycleDraft);validateCycle(cycleDraft)`);
const c=plain(run('cycleDraft'));assert.deepEqual(c.weeklyPlan.flatMap(w=>w.workouts.map(t=>t.exercises[0].sets[0].loadKg)),[80,82.5,85,87.5,90,92.5,95,97.5]);assert.deepEqual(c.weeklyPlan[0].workouts[0].exercises[0].sets,[{count:1,reps:5,loadKg:80},{count:1,reps:5,loadKg:72}]);assert.equal(c.weeklyPlan[0].workouts[1].exercises[0].sets[1].loadKg,74.25);
run(`cycleDraft.type='pavel_step';cycleDraft.progression['Peso Muerto'].repeatWorkouts=3;generatePlan(cycleDraft)`);assert.deepEqual(plain(run('cycleDraft.weeklyPlan.flatMap(w=>w.workouts.map(t=>t.exercises[0].sets[0].loadKg))')),[80,80,80,82.5,82.5,82.5,85,85]);
run(`cycleDraft.type='pavel_linear';generatePlan(cycleDraft);saveCycle();activateCycle(cycles()[0].id);load('2026-10-10')`);assert.equal(run('currentPlan().index'),1);assert.equal(run('sessions().some(s=>s.date===currentSession.date)'),false);
run(`exerciseIndex=currentSession.exercises.findIndex(e=>e.name==='Peso Muerto');applyPlan()`);assert.equal(run('currentSession.summary.volumeLoadKgReps'),760);assert.equal(run('currentSession.cycleWeek'),1);assert.equal(run('currentSession.planSnapshot.workout.exercises[0].sets[0].loadKg'),80);
let comparison=plain(run('weekComparison(cycles()[0],cycles()[0].weeklyPlan[0])'));assert.equal(comparison.actual.sessions,1);assert.equal(comparison.actual.totalReps,10);assert.equal(comparison.planned.totalReps,20);assert.equal(comparison.planned.volumeLoadKgReps,1543.75);
run(`load('2026-10-30')`);assert.equal(run('currentPlan().index'),2);assert.equal(run('currentPlan().week'),1);run(`load('2026-10-10')`);assert.equal(run('currentPlan().index'),1);
run(`editCycle(cycles()[0].id);cycleDraft.weeklyPlan[0].workouts[0].exercises[0].sets[0].loadKg=999;saveCycle()`);assert.equal(run('currentPlan().workout.exercises[0].sets[0].loadKg'),80);assert.equal(run('weekComparison(cycles()[0],cycles()[0].weeklyPlan[0]).planned.volumeLoadKgReps'),1543.75);
run(`currentSession.exercises.push({name:'Desconocido',sets:[{sets:1,reps:10,weight:20,extra:'keep'}]});currentSession.exerciseConfigs.Desconocido={fiveRM:0,rom:.2,unit:'kg',usesBodyweight:false};currentSession.exerciseConfigs['Peso Muerto'].fiveRM=100;currentSession.sessionRpe=8;currentSession.notes='Nota <prueba>';save()`);assert.equal(run('currentSession.summary.intensityCoveragePctReps'),50);assert.equal(run('currentSession.summary.meanRelativeIntensityPct'),67.5488);assert.equal(run('currentSession.summary.sessionRpe'),8);
const exported=plain(run('exportPayload()'));storage.set('workoutSessions','[]');storage.set('workoutSessionsCycles','[]');context.payload=exported;run('importPayload(payload)');assert.deepEqual(plain(run('sessions()')),exported.sessions);assert.deepEqual(plain(run('cycles()')),exported.cycles);
storage.set('workoutSessions','[]');storage.set('workoutSessionsCycles','[]');context.legacy=old;run('importPayload(legacy)');old.forEach((s,i)=>originalFields(s,plain(run('sessions()'))[i]));
const before=storage.get('workoutSessions');assert.throws(()=>run(`importPayload({schemaVersion:2,sessions:[{date:'incorrecta'}],cycles:[]})`));assert.equal(storage.get('workoutSessions'),before);run('importPayload(payload)');assert.equal(run(`sessions().find(s=>s.date==='2026-10-01').custom.keep`),true);
run(`load('2026-10-10');renderSession();go('train',currentSession.exercises.findIndex(e=>e.name==='Pull Ups'));parametersOpen=true;renderTrain()`);assert.ok(element('app').innerHTML.includes('5RM total (cuerpo + lastre)'));assert.ok(element('app').innerHTML.includes('Sin dato'));
run(`go('history');renderHistory();go('settings');go('cycles');editCycle(cycles()[0].id)`);assert.ok(element('app').innerHTML.includes('Guardar ciclo'));
// Quota failure must leave both original collections unchanged.
const oldC=storage.get('workoutSessionsCycles'),oldS=storage.get('workoutSessions'),setter=context.localStorage.setItem;let fail=true;context.localStorage.setItem=(k,v)=>{if(k==='workoutSessions'&&fail){fail=false;throw Error('quota')}setter(k,v)};assert.throws(()=>run('writeCollections([],[])'));assert.equal(storage.get('workoutSessions'),oldS);assert.equal(storage.get('workoutSessionsCycles'),oldC);context.localStorage.setItem=setter;
// Compatible envelope v1; structural edits require regenerating all workouts.
context.compatible={...exported,schemaVersion:1};assert.doesNotThrow(()=>run('importPayload(compatible)'));run(`editCycle(cycles()[0].id);selectCycleExercise('Sentadilla',true)`);assert.throws(()=>run('validateCycle(cycleDraft)'));run('cycleDraft=null');
// Existing training must never acquire cycle metadata just because it is viewed/saved.
run(`currentSession=normalize({...blankSession('2026-10-11'),exercises:[{name:'Peso Muerto',sets:[{sets:1,reps:5,weight:40}]}]});localStorage.setItem(STORAGE_KEY,JSON.stringify([...sessions(),currentSession]));load('2026-10-11');save()`);assert.equal(run('currentSession.cycleId'),undefined);assert.equal(run('currentPlan()'),null);
// Future extension fields survive recalculation, including inside exercise summaries.
run(`currentSession.extraSession={keep:1};currentSession.summary.extraSummary={keep:2};currentSession.summary.byExercise[0].extraExerciseSummary={keep:3};save();load('2026-10-11')`);assert.equal(run('currentSession.extraSession.keep'),1);assert.equal(run('currentSession.summary.extraSummary.keep'),2);assert.equal(run('currentSession.summary.byExercise[0].extraExerciseSummary.keep'),3);
// Compare intensity against the fixed plan reference even if session 5RM differs.
run(`load('2026-10-10');currentSession.exerciseConfigs['Peso Muerto'].fiveRM=200;save()`);assert.ok(Math.abs(run('weekComparison(cycles()[0],cycles()[0].weeklyPlan[0]).actual.meanRelativeIntensityPct')-67.5488)<1e-8);assert.ok(run('currentSession.summary.meanRelativeIntensityPct')<40);
// Export includes unsaved in-memory changes even when saving runs out of space.
context.localStorage.setItem=()=>{throw Error('quota')};run(`currentSession.notes='Cambios sin guardar';save()`);assert.equal(plain(run('exportPayload()')).sessions.find(s=>s.date==='2026-10-10').notes,'Cambios sin guardar');context.localStorage.setItem=setter;
// Opening an earlier date must not reuse a workout already assigned to a later date.
run(`load('2026-11-01');exerciseIndex=currentSession.exercises.findIndex(e=>e.name==='Peso Muerto');applyPlan();load('2026-10-12')`);assert.equal(run('currentPlan().index'),3);
// No network fonts/scripts/styles; every bundled font exists and is a real TTF.
assert.ok(!/fonts\.googleapis|fonts\.gstatic|<script[^>]+src=/.test(html));for(const match of html.matchAll(/url\('fonts\/([^']+)'\)/g)){const bytes=fs.readFileSync('fonts/'+match[1]);assert.equal(bytes.readUInt32BE(0),0x00010000)}
// Phase 4: all nine global metrics, shared dates, cycle bands, sparse values and gestures.
const histStorage=storage.get('workoutSessions'),cycleStorage=storage.get('workoutSessionsCycles');
run(`go('history')`);
let rendered=element('app').innerHTML;
assert.equal((rendered.match(/class="bw-card history-metric"/g)||[]).length,9);
assert.ok(!rendered.includes('<select'));
assert.ok(rendered.indexOf('data-metric="bodyweightKg"')<rendered.indexOf('data-metric="volumeLoadKgReps"'));
assert.ok(rendered.indexOf('data-metric="sessionRpe"')<rendered.indexOf('class="session-list"'));
assert.ok(rendered.includes('class="cycle-band"'));assert.ok(rendered.includes('Aún sin datos suficientes'));
// Uneven dates: all metrics share positions, even when intensity/RPE has holes.
run(`historyFixture=['2026-10-01','2026-10-04','2026-10-30'].map((date,i)=>{const s=normalize({...sessions()[0],date});s.summary.sessionRpe=i===1?8:null;s.summary.meanRelativeIntensityPct=i===1?null:60+i;return s});historyCharts(historyFixture)`);
assert.equal(run('Object.keys(historyPlots).length'),9);
assert.ok(Math.abs(run("historyPlots.totalSets.points[1].x")-(40+288*3/29))<1e-8);
assert.equal(run('historyPlots.bodyweightKg.points[2].x'),328);
assert.equal(run('historyPlots.meanRelativeIntensityPct.points[1].x'),328);
assert.equal(run('historyPlots.sessionRpe.points.length'),1);
run(`historyShow('2026-10-04')`);
for(const key of plain(run('Object.keys(historyPlots)'))){assert.ok(element('historyReadout-'+key).innerHTML.includes('4 OCT'));assert.equal(element('historyCross-'+key).attributes.x1,String(run("historyX('2026-10-04')")))}
assert.ok(element('historyReadout-meanRelativeIntensityPct').innerHTML.includes('Sin dato'));
assert.equal(element('historyFocus-meanRelativeIntensityPct').attributes.visibility,'hidden');
run('historyReset()');assert.ok(element('historyReadout-sessionRpe').innerHTML.includes('Sin dato'));
assert.equal(element('historyCross-totalSets').attributes.visibility,'hidden');
let captures=0,releases=0,prevented=0,captured=false;
context.pointer={type:'pointerup',pointerId:7,pointerType:'touch',button:0,clientX:70,clientY:20,currentTarget:{parentElement:element('historyScroll-totalSets'),getBoundingClientRect:()=>({left:0,width:340}),setPointerCapture(){captures++;captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){releases++;captured=false}},preventDefault(){prevented++}};
run('historyPointerDown(pointer)');context.pointer.clientX=120;run('historyPointerMove(pointer)');assert.equal(captures,1);assert.equal(prevented,1);
run('historyPointerEnd(pointer)');assert.equal(releases,1);assert.equal(run('historyGesture'),null);assert.equal(element('historyCross-totalSets').attributes.visibility,'hidden');
context.pointer.clientX=70;context.pointer.clientY=20;run('historyPointerDown(pointer)');context.pointer.clientY=80;run('historyPointerMove(pointer)');assert.equal(captures,1);assert.equal(prevented,1);run('historyPointerEnd(pointer)');
context.pointer.clientY=20;run('historyPointerDown(pointer);historyPointerEnd(pointer)');assert.equal(element('historyCross-totalSets').attributes.visibility,'visible');
run('historyPointerDown(pointer);historyPointerEnd(pointer)'); assert.equal(element('historyCross-totalSets').attributes.visibility,'hidden'); // Same-point tap toggles off.
assert.match(html,/\.history-svg\{touch-action:pan-y/);assert.ok(!html.includes('touch-action:none'));
rendered=run('historyCharts(historyFixture)');assert.equal((rendered.match(/class="cycle-band"/g)||[]).length,8);assert.ok(rendered.includes('Prueba Pavel'));
assert.equal((run('historyCharts([])').match(/Aún sin datos suficientes/g)||[]).length,9);
assert.equal((run('historyCharts([historyFixture[0]])').match(/Aún sin datos suficientes/g)||[]).length,9);
assert.equal(storage.get('workoutSessions'),histStorage);assert.equal(storage.get('workoutSessionsCycles'),cycleStorage);
// Phase 5: 150 sessions spanning twelve months; simulated layout matches generated width.
run(`yearFixture=Array.from({length:150},(_,i)=>{const s=normalize({...historyFixture[0],date:addDays('2025-10-16',Math.round(i*365/149))});s.summary.sessionRpe=6+i%4;s.summary.meanRelativeIntensityPct=60+i%20;return s});historyCharts(yearFixture)`);
assert.equal(run('historyDates.length'),150);assert.ok(Math.abs(run('historyFactor')-365/70)<1e-10);
rendered=run('historyCharts(yearFixture)');
assert.equal((rendered.match(/class="history-scroll"/g)||[]).length,9);
assert.equal((rendered.match(/class="history-axis"/g)||[]).length,9);
assert.equal((rendered.match(new RegExp('style="width:'+String(100*run('historyFactor')).replace('.', '\\.')+'%"','g'))||[]).length,9);
assert.ok(rendered.includes('onscroll="historyScrolled(event)"'));
assert.ok(!rendered.includes('onpointerleave'));
const keys=plain(run('Object.keys(historyPlots)'));
for(const key of keys){const el=element('historyScroll-'+key);el.clientWidth=300;el.scrollWidth=300*run('historyFactor');el.scrollLeft=0}
run('historyInit()');
for(const key of keys){const el=element('historyScroll-'+key);assert.ok(Math.abs(el.scrollLeft-(el.scrollWidth-el.clientWidth))<1e-8)}
const scaleBefore=plain(run('Object.fromEntries(Object.entries(historyPlots).map(([key,p])=>[key,[p.lo,p.hi]]))'));
// Native scrolling (scrollbar/trackpad) and pointer dragging both propagate the range.
element('historyScroll-totalSets').scrollLeft=420;context.scrollEvent={currentTarget:element('historyScroll-totalSets')};run('historyScrolled(scrollEvent)');
for(const key of keys)assert.ok(Math.abs(element('historyScroll-'+key).scrollLeft-420)<1e-8);
context.pointer.currentTarget.parentElement=element('historyScroll-totalSets');context.pointer.currentTarget.getBoundingClientRect=()=>({left:-420,width:300*run('historyFactor')});
context.pointer.clientX=80;context.pointer.clientY=20;run('historyPointerDown(pointer)');context.pointer.clientX=20;run('historyPointerMove(pointer);historyPointerEnd(pointer)');
for(const key of keys)assert.ok(Math.abs(element('historyScroll-'+key).scrollLeft-480)<1e-8);
assert.equal(run('historySelected'),null);
// Tap persists through release and scrolling; all readouts/cursors share the session.
run('historyPointerDown(pointer);historyPointerEnd(pointer)');const selected=run('historySelected');assert.ok(selected);
for(const key of keys){assert.ok(element('historyReadout-'+key).innerHTML.includes(run(`shortDate('${selected}')`)));assert.equal(element('historyCross-'+key).attributes.visibility,'visible')}
run('historySync(.5)');assert.equal(run('historySelected'),selected);
assert.deepEqual(plain(run('Object.fromEntries(Object.entries(historyPlots).map(([key,p])=>[key,[p.lo,p.hi]]))')),scaleBefore);
run('historyPointerDown(pointer);historyPointerEnd(pointer)');assert.equal(run('historySelected'),null);
run('historyPointerDown(pointer);historyPointerEnd(pointer)');context.pointer.type='pointercancel';run('historyPointerDown(pointer);historyPointerEnd(pointer)');assert.ok(run('historySelected'));context.pointer.type='pointerup';
documentListeners.pointerdown({target:{closest:()=>null}});assert.equal(run('historySelected'),null);
for(const key of keys)assert.equal(element('historyReadout-'+key).innerHTML,run(`historyReadout('${key}',historyPlots['${key}'].samples.at(-1))`));
const offset=run('historyOffset');context.pointer.clientY=20;run('historyPointerDown(pointer)');context.pointer.clientY=90;run('historyPointerMove(pointer);historyPointerEnd(pointer)');assert.equal(run('historyOffset'),offset);assert.equal(run('historySelected'),null);
// Inclusive 70-day boundary has no overflow; 71 days does.
for(const days of [20,70,71]){
 run(`historyCharts([yearFixture[0],{...yearFixture[149],date:addDays(yearFixture[0].date,${days})}])`);
 assert.equal(run('historyFactor>1'),days>70);
 for(const key of keys){const el=element('historyScroll-'+key);el.scrollWidth=300*run('historyFactor');el.clientWidth=300;el.scrollLeft=0}
 run('historyInit()');for(const key of keys)assert.equal(element('historyScroll-'+key).scrollLeft>0,days>70);
}
assert.equal(storage.get('workoutSessions'),histStorage);assert.equal(storage.get('workoutSessionsCycles'),cycleStorage);
run('renderHistory()');
const safeState=storage.get('workoutSessions');storage.set('workoutSessions','{broken');assert.throws(()=>run('sessions()'));assert.equal(storage.get('workoutSessions'),'{broken');storage.set('workoutSessions',safeState);
console.log('PASS: migración sin pérdida; métricas/cobertura; Pavel lineal/escalonado; snapshot y avance sin duplicados; comparación con referencia fija; import/export viejo/nuevo; conflictos; cuota y corrupción; pantallas; fuentes offline; Hist 9 métricas, bandas, fechas compartidas, cursor y scroll.');

})();
