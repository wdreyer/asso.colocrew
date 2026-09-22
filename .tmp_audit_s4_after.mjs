import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function week(r){return {'2026-07-06':'S1','2026-07-20':'S2','2026-08-03':'S3','2026-08-17':'S4'}[String(r.sejour?.startDate||'').slice(0,10)]||r.week||''}
function countChildren(r){return Array.isArray(r.minor?.children)?r.minor.children.length:1}
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app); const snap=await getDocs(collection(db,'reservations'));
const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>week(r)==='S4'&&norm(r.status)==='validated');
const dep={}, ret={}; let children=0;
for(const r of rows){const n=countChildren(r); children+=n; const d=r.transport?.departureCity||'?'; const t=r.transport?.returnCity||'?'; dep[d]=(dep[d]||0)+n; ret[t]=(ret[t]||0)+n;}
console.log('validated reservations', rows.length, 'children', children);
console.log('departure', dep); console.log('return', ret);
for(const r of rows.filter(r=>(r.minor?.children||[]).some(c=>norm(`${c.firstName} ${c.lastName}`).includes('juliabenoit')))) console.log('Julia', r.id, r.numeroDeReservation, r.transport, r.minor.children);
