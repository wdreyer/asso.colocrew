"use client";


import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase"; // chemin depuis app/resultat/page.js
import { doc, onSnapshot, setDoc } from "firebase/firestore";


const POLL_ID = "quiz1"; // doit matcher la page quizz

export default function ResultPage() {
const [data, setData] = useState({ A: 0, B: 0, C: 0, D: 0, total: 0 });


useEffect(() => {
const ref = doc(db, "polls", POLL_ID);
const unsub = onSnapshot(ref, (snap) => {
if (snap.exists()) {
const d = snap.data();
setData({ A: d.A ?? 0, B: d.B ?? 0, C: d.C ?? 0, D: d.D ?? 0, total: d.total ?? 0 });
} else {
setData({ A: 0, B: 0, C: 0, D: 0, total: 0 });
}
});
return () => unsub();
}, []);


const perc = useMemo(() => {
const t = data.total || 0;
const pct = (v) => (t === 0 ? 0 : Math.round((v / t) * 1000) / 10);
return {
A: pct(data.A),
B: pct(data.B),
C: pct(data.C),
D: pct(data.D),
};
}, [data]);


async function resetAll() {
const ref = doc(db, "polls", POLL_ID);
await setDoc(ref, { A: 0, B: 0, C: 0, D: 0, total: 0 });
}


function Bar({ label, value, percent }) {
return (
<div className="space-y-1">
<div className="flex items-baseline justify-between">
<span className="font-semibold">{label}</span>
<span className="tabular-nums">{percent}% ({value})</span>
</div>
<div className="h-3 w-full rounded-full bg-gray-200">
<div
className="h-3 rounded-full bg-gray-800"
style={{ width: `${percent}%` }}
/>
</div>
</div>
);
}


return (
<main className="mx-auto max-w-xl p-6 flex flex-col gap-6">
<h1 className="text-2xl font-bold">Résultats</h1>
<p className="text-sm opacity-70">Total votes : {data.total}</p>


<div className="space-y-4">
<Bar label="A" value={data.A} percent={perc.A} />
<Bar label="B" value={data.B} percent={perc.B} />
<Bar label="C" value={data.C} percent={perc.C} />
<Bar label="D" value={data.D} percent={perc.D} />
</div>


<button
onClick={resetAll}
className="mt-4 self-start rounded-2xl border px-4 py-2 text-sm font-medium shadow-sm hover:shadow"
>
Réinitialiser
</button>
</main>
);
}