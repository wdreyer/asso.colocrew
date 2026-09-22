import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function amt(v){ const n=Number(String(v??'').replace(',','.')); return Number.isFinite(n)?n:0; }
function childrenCount(r){ return r.minor?.children?.length || r.children?.length || r.childCount || 1; }
function weekFromReservation(r){ return r.week || ({'2026-07-20':'S2'}[String(r.startDate||r.sejour?.startDate||'').slice(0,10)]) || r.sejourWeek || ''; }
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app);
const rs=await getDocs(collection(db,'reservations'));
const all=rs.docs.map(d=>({id:d.id,...d.data()})).filter(r=>weekFromReservation(r)==='S2');
const statusCounts={}; for(const r of all){ const s=r.status||''; statusCounts[s]=(statusCounts[s]||0)+childrenCount(r); }
console.log('statusCounts', statusCounts);
for (const strict of [false,true]){
 const reservations=all.filter(r=> strict ? norm(r.status)==='validated' : !/annul|archive|deleted|cancel/.test(norm(r.status)) );
 const byCity={}; let total=0, revTotal=0;
 for (const r of reservations) {
  const dep=r.transport?.departureCity||r.departureCity||r.pickupCity||'';
  const ret=r.transport?.returnCity||r.returnCity||'';
  const n=childrenCount(r); total+=n;
  const rev=amt(r.accounting?.transportAmount ?? r.payment?.transportAmount ?? r.transportAmount ?? r.finance?.transportAmount); revTotal+=rev;
  const key=`${dep} -> ${ret}`; byCity[key]??={count:0, rev:0}; byCity[key].count+=n; byCity[key].rev+=rev;
 }
 console.log('\nstrict', strict, 'children', total, 'rev', revTotal);
 for(const [k,v] of Object.entries(byCity).sort()) console.log(k, v.count, v.rev);
}
