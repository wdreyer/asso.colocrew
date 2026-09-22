import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
function loadEnv(filePath){ if(!fs.existsSync(filePath)) return; for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k]) process.env[k]=v; }}
function count(p){ return p.children?.length||1; }
function cityFor(t,p){ return t.direction==='aller' ? (p.departureCity||p.pickupCity||'') : (p.returnCity||p.pickupCity||p.dropoffCity||''); }
loadEnv('.env.local');
const app=getApps()[0]||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''});
const db=getFirestore(app);
const ids=['UrYWvoqOWbzNcv53DyCS','2induumArFBxjVCTLaw0','s2-2026-bus-aller-final','04AhMrhz1dYCHxsI7yJp','E032d8KCH3OVHdgy5bA5','s2-2026-bus-retour-autocar'];
const ts=await getDocs(collection(db,'transports'));
const map=new Map(ts.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
for (const id of ids){ const t=map.get(id); console.log('\n', id, t.sejourName, t.direction, t.status, 'pass', t.passengers?.length); const counts={}; for(const p of t.passengers||[]){ const c=cityFor(t,p); counts[c]=(counts[c]||0)+count(p);} console.log(counts); }
