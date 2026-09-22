import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app);
const snap=await getDocs(collection(db,'transports'));
const trs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>['S2','S3'].includes(t.week)&&t.direction==='retour');
for(const t of trs.sort((a,b)=>String(a.week).localeCompare(b.week)||String(a.sejourName).localeCompare(b.sejourName))){
 console.log('\n'+t.week, t.sejourName, t.date, t.departureCity+' -> '+t.arrivalCity, (t.departureTime||'')+'-'+(t.arrivalTime||''));
 for(const s of [...(t.segments||[]),...(t.branches||[])]) console.log(' ', s.from+' -> '+s.to, (s.departureTime||'?')+'-'+(s.arrivalTime||'?'), s.id);
}
