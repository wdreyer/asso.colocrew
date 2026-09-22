import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

function loadEnv(filePath){
  if(!fs.existsSync(filePath)) return;
  for(const line of fs.readFileSync(filePath,"utf8").split(/\r?\n/)){
    const t=line.trim(); if(!t||t.startsWith('#')) continue;
    const i=t.indexOf('='); if(i<0) continue;
    const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');
    if(!process.env[k]) process.env[k]=v;
  }
}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function childCount(r){return Array.isArray(r.minor?.children) && r.minor.children.length ? r.minor.children.length : 1;}

loadEnv('.env.local');
const shouldApply = process.argv.includes('--apply');
const transportId = 'a3nfZsgZQRhGxPEFvmAn';
const segmentId = 's4-aller-paris-dax-rc9h849i';
const ticketId = 's4-aller-paris-dax-rc9h849i-option';

const app=getApps()[0]||initializeApp({
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',
  authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||'',
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',
  storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||'',
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||'',
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||''
});
const db=getFirestore(app);
const [transportSnap, reservationSnap] = await Promise.all([
  getDocs(collection(db,'transports')),
  getDocs(collection(db,'reservations')),
]);
const transport = transportSnap.docs.map(d=>({id:d.id,...d.data()})).find(t=>t.id===transportId);
if(!transport) throw new Error(`Transport introuvable ${transportId}`);
const parisReservations = reservationSnap.docs
  .map(d=>({id:d.id,...d.data()}))
  .filter(r => String(r.sejour?.startDate||'').slice(0,10)==='2026-08-17')
  .filter(r => norm(r.status)==='validated')
  .filter(r => norm(r.transport?.departureCity)==='paris')
  .sort((a,b)=>String(a.numeroDeReservation||a.id).localeCompare(String(b.numeroDeReservation||b.id), 'fr'));
const passengers = parisReservations.map(r => ({
  reservationId: r.id,
  pickupCity: 'Paris',
  departureCity: 'Paris',
  dropoffCity: 'Dax',
  returnCity: r.transport?.returnCity || '',
}));
const childSeats = parisReservations.reduce((sum,r)=>sum+childCount(r),0);
const segment = {
  ...(transport.segments || [])[0],
  id: segmentId,
  from: 'Paris',
  to: 'Dax',
  mode: 'Train',
  trainType: 'Train',
  number: 'RC9H849I',
  departureTime: '15:56',
  arrivalTime: '19:31',
  meetingTime: '14:56',
  meetingPoint: 'Gare SNCF Paris Montparnasse - espace d\'attente Hall 1 - Niveau 2 sortie Mouchotte (Espace Maine) - entre Moleskine et Sephora',
  platform: '',
  stopType: 'rdv',
  passengerReservationIds: parisReservations.map(r=>r.id),
  sharedPickupChildren: childSeats,
  instructions: 'Départ Paris Montparnasse vers Dax. Option groupe 20 places RC9H849I, paiement dû avant le 07/08/2026 à 17:40.',
};
const ticket = {
  id: ticketId,
  segmentId,
  name: 'Option groupe RC9H849I - Paris Montparnasse > Dax (20 places)',
  bookingReference: 'RC9H849I',
  externalReference: 'RC9H849I',
  trainType: 'Train',
  trainNumber: 'RC9H849I',
  from: 'Paris',
  to: 'Dax',
  coverageFrom: 'Paris',
  coverageTo: 'Dax',
  segmentLabel: 'Paris Montparnasse > Dax',
  date: '2026-08-17',
  departureTime: '15:56',
  arrivalTime: '19:31',
  seats: 20,
  price: '',
  purchased: false,
  option: true,
  paymentDueAt: '2026-08-07T17:40:00+02:00',
  coveredReservationIds: parisReservations.map(r=>r.id),
  notes: 'Créé depuis capture SNCF : 20 places, paiement dû avant le 07/08/2026 à 17:40. Prix non visible sur la capture.',
};
const nextTickets = [
  ...(transport.tickets || []).filter(t => t.id !== ticketId && t.segmentId !== segmentId),
  ticket,
];
const patch = {
  departureCity: 'Paris',
  arrivalCity: 'Dax',
  departureTime: '15:56',
  arrivalTime: '19:31',
  meetingTime: '14:56',
  meetingPoint: segment.meetingPoint,
  trainType: 'Train',
  trainNumber: 'RC9H849I',
  capacity: 20,
  status: 'brouillon',
  passengers,
  segments: [segment],
  branches: [],
  tickets: nextTickets,
  updatedAt: serverTimestamp(),
};
console.log(JSON.stringify({
  mode: shouldApply ? 'apply' : 'dry-run',
  transportId,
  childrenParis: childSeats,
  reservationsParis: parisReservations.length,
  passengers: parisReservations.map(r=>({id:r.id, ref:r.numeroDeReservation, children:(r.minor?.children||[]).map(c=>`${c.firstName} ${c.lastName}`)})),
  segment,
  ticket,
}, null, 2));
if(shouldApply){
  await updateDoc(doc(db,'transports',transportId), patch);
  console.log('APPLIED');
}
