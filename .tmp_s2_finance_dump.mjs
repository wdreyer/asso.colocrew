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
const [ts,rs]=await Promise.all([getDocs(collection(db,'transports')), getDocs(collection(db,'reservations'))]);
const transports=ts.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.week==='S2' && !/annul|archive|deleted|cancel/.test(norm(t.status)));
const reservations=rs.docs.map(d=>({id:d.id,...d.data()})).filter(r=>weekFromReservation(r)==='S2' && !/annul|archive|deleted|cancel/.test(norm(r.status)));
console.log('TRANSPORTS', transports.length);
for (const t of transports.sort((a,b)=>String(a.direction).localeCompare(String(b.direction))||String(a.sejourName).localeCompare(String(b.sejourName)))) {
 console.log('\nT', t.id, t.sejourName, t.direction, t.date, t.departureCity,'->',t.arrivalCity, 'pass', (t.passengers||[]).length);
 for (const s of [...(t.segments||[]),...(t.branches||[])]) console.log(' SEG', s.id, s.from,'->',s.to, s.departureTime,'-',s.arrivalTime, 'staff',s.assignedStaffIds?.length||0, 'passIds',s.passengerReservationIds?.length||0, 'stops', JSON.stringify(s.stops||[]));
 for (const tk of (t.tickets||[])) console.log(' TICKET', tk.segmentId, tk.name, 'seats',tk.seats, 'price',tk.price, 'purch',tk.purchased, 'ref',tk.bookingReference||tk.externalReference||'', 'fromto',tk.from,'->',tk.to);
}
console.log('\nRESERVATIONS', reservations.length);
const byCity={};
for (const r of reservations) {
 const dep=r.transport?.departureCity||r.departureCity||r.pickupCity||'';
 const ret=r.transport?.returnCity||r.returnCity||'';
 const n=childrenCount(r);
 const rev=amt(r.accounting?.transportAmount ?? r.payment?.transportAmount ?? r.transportAmount ?? r.finance?.transportAmount);
 const key=`${dep} -> ${ret}`;
 byCity[key]??={count:0, rev:0, rows:[]}; byCity[key].count+=n; byCity[key].rev+=rev; byCity[key].rows.push({id:r.id, ref:r.numeroDeReservation||r.reference, n, rev, dep, ret, status:r.status});
}
for (const [k,v] of Object.entries(byCity).sort()) console.log('CITY', k, 'children', v.count, 'revenue', v.rev);
