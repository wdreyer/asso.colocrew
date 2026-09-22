import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app);
const ts=await getDocs(collection(db,'transports'));
const transports=ts.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.week==='S2');
for (const t of transports.sort((a,b)=>String(a.direction).localeCompare(String(b.direction))||String(a.date).localeCompare(String(b.date))||String(a.sejourName).localeCompare(String(b.sejourName)))) {
 console.log('\nT', t.id, '|', t.sejourName, '|', t.direction, '|', t.date, '| status', t.status, '|', t.departureCity,'->',t.arrivalCity, '| pass', (t.passengers||[]).length);
 for (const tk of (t.tickets||[])) console.log(' ', tk.segmentId, '|', tk.name, '| seats',tk.seats, '| price',tk.price, '| purchased',tk.purchased, '| ref',tk.bookingReference||tk.externalReference||'', '|', tk.from,'->',tk.to);
}
