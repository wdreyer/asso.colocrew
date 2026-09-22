import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app);
const snap=await getDocs(collection(db,'transports'));
const trs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.week==='S3'&&t.direction==='retour');
for(const t of trs){
 console.log('\nTRANSPORT', t.sejourName, t.id, t.date, t.departureCity,'->',t.arrivalCity, t.departureTime,t.arrivalTime);
 const counts={};
 for(const p of t.passengers||[]){
   const city=p.returnCity||p.dropoffCity||p.pickupCity||'?';
   const n=p.children?.length||1;
   counts[city]=(counts[city]||0)+n;
 }
 console.log('counts', counts);
 for(const s of [...(t.segments||[]),...(t.branches||[])]){
   console.log('SEG', s.id, s.from,'->',s.to, s.departureTime,'-',s.arrivalTime,'staff',s.assignedStaffIds?.length||0,'passIds',s.passengerReservationIds?.length||0,'stops',JSON.stringify(s.stops||[]));
 }
}
