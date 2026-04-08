import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif"]);
const CODE_EXT = new Set([
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".php",
  ".twig",
  ".json",
  ".yaml",
  ".yml",
  ".md",
]);
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "backup_site", ".turbo"]);

let usageCache = null;
let usageCacheAt = 0;
const USAGE_CACHE_TTL_MS = 60_000;

function safeDecode(value) {
  let out = String(value || "");
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(out);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

function normalizeUsagePath(raw) {
  if (!raw) return "";
  let value = safeDecode(raw).replace(/\\/g, "/");
  value = value.split("?")[0].split("#")[0];
  const idx = value.toLowerCase().indexOf("banqueimage/");
  if (idx < 0) return "";
  return value
    .slice(idx)
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function walkCodeFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!CODE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      files.push(abs);
    }
  }
  return files;
}

function buildUsageIndex() {
  const now = Date.now();
  if (usageCache && now - usageCacheAt < USAGE_CACHE_TTL_MS) return usageCache;

  const root = process.cwd();
  const out = {};
  const addRef = (key, ref) => {
    if (!key) return;
    if (!out[key]) out[key] = [];
    if (!out[key].includes(ref)) out[key].push(ref);
  };

  for (const absFile of walkCodeFiles(root)) {
    let content = "";
    try {
      content = readFileSync(absFile, "utf8");
    } catch {
      continue;
    }

    const rel = path.relative(root, absFile).replace(/\\/g, "/");
    const regex = /(?:\.{1,2}\/|\/)?banqueimage\/[^\s"'`)<>\]}]+/gi;
    let match;
    let line = 1;
    let prevIdx = 0;

    while ((match = regex.exec(content))) {
      const before = content.slice(prevIdx, match.index);
      line += (before.match(/\n/g) || []).length;
      prevIdx = match.index;

      const key = normalizeUsagePath(match[0]);
      if (!key) continue;
      addRef(key, `${rel}:${line}`);
    }
  }

  usageCache = out;
  usageCacheAt = now;
  return out;
}

function localManifest() {
  const base = path.join(process.cwd(), "public", "banqueimage");
  const albums = [];
  try {
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const album = d.name;
      const files = readdirSync(path.join(base, album), { withFileTypes: true })
        .filter((f) => f.isFile() && IMG_EXT.has(path.extname(f.name).toLowerCase()))
        .map((f) => f.name)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
      if (!files.length) continue;
      albums.push({
        nom: album,
        count: files.length,
        coverUrl: `/banqueimage/${encodeURIComponent(album)}/${encodeURIComponent(files[0])}`,
        photos: files.map((name, i) => ({
          id: `local-${album}-${i}`,
          nom: name,
          album,
          url: `/banqueimage/${encodeURIComponent(album)}/${encodeURIComponent(name)}`,
          storagePath: `banqueimage/${album}/${name}`,
          taille: 0,
          ordre: i + 1,
          isLocal: true,
        })),
      });
    }
  } catch (_e) {}
  return { albums };
}

function getFirebaseClientConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
}

function html(manifest, usageIndex, firebaseConfig) {
  return `<!doctype html><html lang="fr"><head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Photothèque ColoCrew</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <style>
  :root{--bg:#f7f3ee;--surface:#ffffff;--border:#e7dfd3;--accent:#b8336a;--text:#2d2540;--muted:#7d748f;--danger:#c54552}
  *{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at 10% 0%,rgba(184,51,106,.10) 0%,rgba(184,51,106,0) 42%),radial-gradient(circle at 90% 18%,rgba(45,37,64,.08) 0%,rgba(45,37,64,0) 36%),var(--bg);color:var(--text);font-family:"DM Sans",sans-serif}
  h1,h2{font-family:"Playfair Display",serif;margin:0} .hidden{display:none!important}
  .app{display:flex;min-height:100vh}
  .side{position:fixed;left:0;top:0;bottom:0;width:64px;background:#fff;border-right:1px solid var(--border);overflow:hidden;transition:.25s;z-index:20}
  .side:hover{width:220px} .logo{height:58px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--border)}
  .dot{width:12px;height:12px;border-radius:99px;background:var(--accent)} .lt{opacity:0;transition:.2s;white-space:nowrap}.side:hover .lt{opacity:1}
  .sbtn{display:flex;align-items:center;gap:10px;margin:8px 10px;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:10px;background:#faf7f2;color:var(--text);cursor:pointer}
  .sbtn:hover{border-color:var(--accent);color:var(--accent)} .sbtn span:last-child{opacity:0;transition:.2s;white-space:nowrap}.side:hover .sbtn span:last-child{opacity:1}
  .search{margin:10px;border:1px solid var(--border);border-radius:10px;height:38px;display:flex;align-items:center;padding:0 10px;gap:8px;background:#faf7f2}
  .search input{width:100%;background:transparent;border:none;color:var(--text);outline:none}.search input::placeholder{color:#8d8882}
  .main{margin-left:64px;width:calc(100% - 64px);padding:18px 20px 80px}
  .top{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:12px}.crumb{font-size:.9rem;color:var(--muted)}
  .bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .btn,.sel{height:38px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:0 12px}
  .btn{cursor:pointer}.btn:hover{border-color:var(--accent);color:var(--accent)} .btn.acc{background:rgba(184,51,106,.10);border-color:rgba(184,51,106,.35)}
  .btn.danger{background:#fdecee;border-color:#f0c2c8;color:#b33e4b}
  .banner{border:1px solid #f0c2c8;background:#fdecee;padding:10px;border-radius:12px;margin:0 0 12px;color:#8e2f3b}
  .albums{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
  .acard{border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden;cursor:pointer;transition:.2s}
  .acard:hover{transform:translateY(-3px);border-color:#d8aac0}.acard img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#f0ebe3}
  .ab{padding:10px}.an{font-weight:700}.ac{color:var(--muted);font-size:.9rem;margin-top:4px}
  .photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
  .pcard{border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;position:relative}
  .thumb{position:relative;aspect-ratio:1/1;background:#f0ebe3}.thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .ov{position:absolute;inset:0;display:flex;justify-content:space-between;align-items:end;padding:8px;background:linear-gradient(180deg,transparent,rgba(45,37,64,.55));opacity:0;transition:.2s}
  .thumb:hover .ov{opacity:1} .cb{position:absolute;top:8px;left:8px;opacity:0;accent-color:var(--accent)} .thumb:hover .cb,.cb:checked{opacity:1}
  .ib{width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.86);color:#2d2540;cursor:pointer}
  .ib:hover{color:var(--accent);border-color:var(--accent)} .pm{padding:8px}.pn{font-size:.84rem;word-break:break-all;min-height:34px}.ps{font-size:.74rem;color:var(--muted);margin-top:4px}
  .up{border:1px dashed #d9b0c3;border-radius:12px;background:#fff6fb;padding:12px;margin-bottom:12px}
  .drop{border:1px dashed #d8aac0;border-radius:10px;min-height:90px;display:grid;place-items:center;cursor:pointer;color:#8b5070;text-align:center;padding:10px}
  .drop.drag{background:#fceef5;border-color:var(--accent)} .ul{display:grid;gap:8px;margin-top:10px}
  .ui{display:grid;grid-template-columns:46px 1fr auto;gap:8px;align-items:center;border:1px solid var(--border);background:#fff;border-radius:10px;padding:8px}
  .ui img{width:46px;height:46px;object-fit:cover;border-radius:8px}.pr{height:7px;border-radius:99px;background:#ece4d8;overflow:hidden}.pr span{display:block;height:100%;background:var(--accent);width:0}
  .modal,.light{position:fixed;inset:0;background:rgba(45,37,64,.45);display:none;align-items:center;justify-content:center;padding:20px;z-index:100}
  .modal.open,.light.open{display:flex}
  .mc{width:min(450px,100%);background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px}
  .ma{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  .lw{width:min(1050px,100%);background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .lh,.lf{display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border)}.lf{border-top:1px solid var(--border);border-bottom:none}
  .lc{display:grid;place-items:center;min-height:52vh;background:#f5f0e8}.lc img{max-width:100%;max-height:72vh;object-fit:contain}
  .toasts{position:fixed;right:12px;bottom:12px;display:grid;gap:8px;z-index:120}
  .toast{border:1px solid var(--border);background:#fff;padding:9px 11px;border-radius:10px;font-size:.85rem}.toast.success{border-color:rgba(79,191,139,.45)}.toast.error{border-color:rgba(227,93,93,.6)}
  @media(max-width:900px){.side{top:auto;right:0;height:56px;width:100%;border-right:none;border-top:1px solid var(--border)}.side:hover{width:100%}.logo,.search{display:none}
  .sbtn{margin:8px 5px}.sbtn span:last-child{display:none!important}.main{margin-left:0;width:100%;padding-bottom:74px}}
  </style></head><body>
  <div class="app">
    <aside class="side">
      <div class="logo"><span class="dot"></span><div class="lt"><strong>ColoCrew</strong><div style="font-size:.78rem;color:var(--muted)">Photothèque</div></div></div>
      <button class="sbtn" id="bAlbums"><span>🗂</span><span>Albums</span></button>
      <button class="sbtn" id="bUploadSide"><span>⤴</span><span>Upload</span></button>
      <button class="sbtn" id="bSort"><span>⇅</span><span>Tri</span></button>
      <div class="search"><span>🔎</span><input id="search" type="search" placeholder="Recherche..."></div>
    </aside>
    <main class="main">
      <div class="top"><div><h1 id="title">Photothèque</h1><div style="color:var(--muted)" id="sub">Gestion des albums et photos</div></div><div class="crumb" id="crumb">Accueil</div></div>
      <div id="banner" class="banner hidden"></div>
      <div class="bar">
        <button class="btn acc" id="bNewAlbum">+ Nouvel album</button>
        <button class="btn" id="bUploadMain">Ajouter des photos</button>
        <select class="sel" id="sort">
          <option value="date_desc">Date ajout (récent → ancien)</option><option value="date_asc">Date ajout (ancien → récent)</option>
          <option value="name_asc">Nom A → Z</option><option value="name_desc">Nom Z → A</option><option value="size_desc">Taille (grande → petite)</option>
          <option value="manual">Ordre manuel</option>
        </select>
        <button class="btn danger hidden" id="bDelSel">Supprimer la sélection</button>
        <button class="btn danger hidden" id="bDelAlbum">Supprimer l'album</button>
      </div>
      <section id="upload" class="up hidden">
        <div id="drop" class="drop"><div><div style="font-weight:700">Glissez-déposez les fichiers</div><div style="font-size:.9rem;color:var(--muted)">ou cliquez (.jpg .jpeg .png .webp .gif)</div></div></div>
        <input id="files" class="hidden" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif">
        <div id="uList" class="ul"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="bUpClose">Fermer</button><button class="btn acc" id="bUpStart">Lancer l'upload</button></div>
      </section>
      <section id="vAlbums"><div id="albums" class="albums"></div></section>
      <section id="vPhotos" class="hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;padding-bottom:10px;border-bottom:1px solid var(--border)"><h2 id="albumT">Album</h2><div style="color:var(--muted)" id="albumC">0 photo</div></div>
        <div id="photos" class="photos"></div>
      </section>
    </main>
  </div>
  <div id="m" class="modal"><div class="mc"><h3 id="mT" style="font-family:'Playfair Display',serif;margin:0 0 8px">Confirmer</h3><p id="mX" style="margin:0;color:var(--muted)">Action irréversible</p><div class="ma"><button class="btn" id="mNo">Annuler</button><button class="btn danger" id="mYes">Supprimer</button></div></div></div>
  <div id="l" class="light"><div class="lw"><div class="lh"><strong id="lName">photo.jpg</strong><div style="display:flex;gap:8px"><button class="btn" id="lCopy">Copier URL</button><a class="btn" id="lDown" download>Télécharger</a><button class="btn" id="lClose">Fermer</button></div></div><div class="lc"><img id="lImg" alt=""></div><div class="lf"><div style="display:flex;gap:8px"><button class="btn" id="lPrev">←</button><button class="btn" id="lNext">→</button></div><small id="lIdx" style="color:var(--muted)">1 / 1</small></div></div></div>
  <div id="toasts" class="toasts"></div>

  <script type="module">
    // 🔧 CONFIGURATION — Préremplie via variables NEXT_PUBLIC_FIREBASE_* côté serveur
    const firebaseConfig = ${JSON.stringify(firebaseConfig)};

    // ═══ FIREBASE ════════════
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
    import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
    import { getStorage, ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
    const LOCAL = ${JSON.stringify(manifest)};
    const USAGE_INDEX = ${JSON.stringify(usageIndex)};

    const S={db:null,st:null,ok:false,ro:false,albums:[],map:{},cur:null,sort:"date_desc",sel:new Set(),q:"",queue:[],light:{list:[],i:0}};
    const E={t:id=>document.getElementById(id)}; const $=(id)=>E.t(id);
    const els={title:$("title"),sub:$("sub"),crumb:$("crumb"),banner:$("banner"),vAlbums:$("vAlbums"),vPhotos:$("vPhotos"),albums:$("albums"),photos:$("photos"),albumT:$("albumT"),albumC:$("albumC"),sort:$("sort"),search:$("search"),upload:$("upload"),drop:$("drop"),files:$("files"),uList:$("uList"),bDelSel:$("bDelSel"),bDelAlbum:$("bDelAlbum"),m:$("m"),mT:$("mT"),mX:$("mX"),mNo:$("mNo"),mYes:$("mYes"),l:$("l"),lImg:$("lImg"),lName:$("lName"),lIdx:$("lIdx"),lDown:$("lDown"),toasts:$("toasts"),lCopy:$("lCopy")};

    const cfgOk=()=>["apiKey","authDomain","projectId","storageBucket","appId"].every(k=>String(firebaseConfig[k]||"").trim());
    const toast=(m,t="info")=>{const n=document.createElement("div");n.className="toast "+t;n.textContent=m;els.toasts.appendChild(n);setTimeout(()=>n.remove(),3200)};
    const dateMs=v=>v?.toMillis?v.toMillis():v?.seconds?v.seconds*1000:(new Date(v||0).getTime()||0);
    const bytes=v=>!v?"—":(v<1024?v+" o":v<1048576?(v/1024).toFixed(1)+" Ko":(v/1048576).toFixed(1)+" Mo");
    const nAlbum=s=>(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim().replace(/\\s+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/_+/g,"_").replace(/^_+|_+$/g,"")||"album";
    function normalizeFilename(name){const i=name.lastIndexOf(".");const ext=(i>-1?name.slice(i+1):"jpg").toLowerCase();const base=(i>-1?name.slice(0,i):name).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim().replace(/\\s+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/_+/g,"_").replace(/^_+|_+$/g,"")||"photo";return base+"."+ext}
    const sp=(a,n)=>"banqueimage/"+encodeURIComponent(a)+"/"+encodeURIComponent(n);
    const dedupe=(n,set)=>{const i=n.lastIndexOf(".");const b=i>-1?n.slice(0,i):n;const e=i>-1?n.slice(i):"";let c=n,k=1;while(set.has(c.toLowerCase())){c=b+"_"+k+e;k++}return c};
    const dUri=(v)=>{try{return decodeURIComponent(v)}catch{return v}};
    const nUsage=(v)=>{if(!v)return"";let s=String(v).replace(/\\\\/g,"/");s=dUri(s);s=s.split("?")[0].split("#")[0];const i=s.toLowerCase().indexOf("banqueimage/");if(i<0)return"";return s.slice(i).replace(/^\\/+/, "").replace(/\\/+/g,"/").toLowerCase()};
    const usageFor=(paths)=>{const bag=new Set();(paths||[]).forEach((p)=>{const k=nUsage(p);const refs=USAGE_INDEX[k]||[];refs.forEach((r)=>bag.add(r))});return [...bag]};
    const warnUsage=(paths,action)=>{const refs=usageFor(paths);if(!refs.length)return true;const preview=refs.slice(0,8).join("\\n");const more=refs.length>8?"\\n... +"+(refs.length-8)+" emplacement(s)":"";
      return window.confirm("Attention: cette photo est referencee sur le site ("+refs.length+" emplacement(s)).\\n\\n"+preview+more+"\\n\\nContinuer "+action+" ?")};
    const sorted=(a)=>{let l=[...(S.map[a]||[])];if(S.q)l=l.filter(p=>(p.nom||"").toLowerCase().includes(S.q));switch(S.sort){case"date_asc":l.sort((x,y)=>dateMs(x.dateAjout)-dateMs(y.dateAjout));break;case"name_asc":l.sort((x,y)=>(x.nom||"").localeCompare(y.nom||"","fr",{sensitivity:"base"}));break;case"name_desc":l.sort((x,y)=>(y.nom||"").localeCompare(x.nom||"","fr",{sensitivity:"base"}));break;case"size_desc":l.sort((x,y)=>(y.taille||0)-(x.taille||0));break;case"manual":l.sort((x,y)=>(x.ordre||0)-(y.ordre||0));break;default:l.sort((x,y)=>dateMs(y.dateAjout)-dateMs(x.dateAjout));}return l};
    function banner(m){els.banner.innerHTML=m;els.banner.classList.remove("hidden")} function hideBanner(){els.banner.classList.add("hidden");els.banner.textContent=""}
    const localHydrate=()=>{S.albums=(LOCAL.albums||[]).map(a=>({nom:a.nom,count:a.count,coverUrl:a.coverUrl||""}));S.map={};(LOCAL.albums||[]).forEach((a)=>{S.map[a.nom]=(a.photos||[]).map((p)=>({...p}))})};

    async function init(){ if(!cfgOk()){S.ro=true;banner("Firebase non configuré. Remplissez <code>firebaseConfig</code> en haut du fichier. Mode local en lecture seule."); localHydrate(); return}
      try{const app=initializeApp(firebaseConfig);S.db=getFirestore(app);S.st=getStorage(app);S.ok=true;hideBanner()}catch(e){S.ro=true;banner("Erreur Firebase: "+(e?.message||"inconnue"));localHydrate();return}
      try{const snap=await getDocs(collection(S.db,"photos"));const map={};snap.forEach(d=>{const x=d.data(),a=x.album||"divers";if(!map[a])map[a]=[];map[a].push({id:d.id,nom:x.nom||"photo",album:a,url:x.url||"",storagePath:x.storagePath||("banqueimage/"+a+"/"+(x.nom||"")),dateAjout:x.dateAjout||0,taille:Number(x.taille||0),ordre:Number(x.ordre||0)})});
        let names=Object.keys(map); try{const as=await getDocs(collection(S.db,"albums"));as.forEach(r=>{const n=r.data()?.nom;if(n&&!names.includes(n)){names.push(n);map[n]=[]}})}catch{}
        if(!names.length){localHydrate();if(S.albums.length)toast("Aucune photo Firestore, affichage local.", "info")} else {S.map=map;S.albums=names.map(n=>({nom:n,count:(map[n]||[]).length,coverUrl:map[n]?.[0]?.url||""})).sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{sensitivity:"base"}))}
      }catch(e){toast("Erreur chargement Firestore","error");localHydrate()}
    }

    // ═══ ALBUMS ══════════════
    function renderAlbums(){S.cur=null;S.sel.clear();els.vAlbums.classList.remove("hidden");els.vPhotos.classList.add("hidden");els.bDelSel.classList.add("hidden");els.bDelAlbum.classList.add("hidden");els.upload.classList.add("hidden");
      $("title").textContent="Photothèque";$("sub").textContent=S.ro?"Mode local / lecture seule":"Gestion des albums et photos";$("crumb").textContent="Accueil";
      els.albums.innerHTML="";let list=S.albums; if(S.q){list=list.filter(a=>a.nom.toLowerCase().includes(S.q)||(S.map[a.nom]||[]).some(p=>(p.nom||"").toLowerCase().includes(S.q)))}
      if(!list.length){els.albums.innerHTML="<div style='color:var(--muted)'>Aucun album trouvé.</div>";return}
      list.forEach(a=>{const n=document.createElement("article");n.className="acard";n.innerHTML='<img loading="lazy" src="'+(a.coverUrl||"")+'" alt="'+a.nom+'"><div class="ab"><div class="an">'+a.nom+'</div><div class="ac">'+a.count+" photo"+(a.count>1?"s":"")+'</div></div>';n.onclick=()=>openAlbum(a.nom);els.albums.appendChild(n)})
    }
    function openAlbum(a){S.cur=a;S.sel.clear();els.vAlbums.classList.add("hidden");els.vPhotos.classList.remove("hidden");els.bDelAlbum.classList.toggle("hidden",S.ro);els.bDelSel.classList.add("hidden");
      $("title").textContent=a;$("sub").textContent="Album";$("crumb").textContent="Accueil > "+a;els.albumT.textContent=a;renderPhotos()}

    // ═══ PHOTOS ══════════════
    function renderPhotos(){if(!S.cur)return;const l=sorted(S.cur);els.albumC.textContent=l.length+" photo"+(l.length>1?"s":"");els.photos.innerHTML="";if(!l.length){els.photos.innerHTML="<div style='color:var(--muted)'>Aucune photo dans cet album.</div>";return}
      l.forEach((p,idx)=>{const c=document.createElement("article");c.className="pcard";c.dataset.id=p.id;c.draggable=S.sort==="manual"&&!S.ro;
        const chk=S.sel.has(p.id)?"checked":"";c.innerHTML='<div class="thumb"><img loading="lazy" src="'+p.url+'" alt="'+(p.nom||"photo")+'"><input class="cb" type="checkbox" '+chk+'><div class="ov"><div style="display:flex;gap:6px"><button class="ib o">👁</button><button class="ib k">🔗</button><button class="ib mv">↦</button></div></div></div><div class="pm"><div class="pn">'+(p.nom||"photo")+'</div><div class="ps">'+bytes(p.taille)+'</div></div>';
        c.querySelector(".cb").onchange=(e)=>{e.target.checked?S.sel.add(p.id):S.sel.delete(p.id);els.bDelSel.classList.toggle("hidden",!S.sel.size||S.ro||!S.cur)};
        c.querySelector(".o").onclick=(e)=>{e.stopPropagation();openLight(p.id)}; c.querySelector(".k").onclick=async(e)=>{e.stopPropagation();try{await navigator.clipboard.writeText(p.url||"");toast("URL copiée","success")}catch{toast("Copie impossible","error")}};
        c.querySelector(".mv").onclick=async(e)=>{e.stopPropagation();await movePhoto(p)};
        c.querySelector(".pn").ondblclick=()=>renamePhoto(p);
        c.onclick=()=>openLight(p.id);
        if(S.sort==="manual"&&!S.ro){c.ondragstart=e=>{c.classList.add("drag");e.dataTransfer.setData("id",p.id)};c.ondragend=()=>c.classList.remove("drag");c.ondragover=e=>{e.preventDefault();c.style.outline="2px dashed var(--accent)"};c.ondragleave=()=>c.style.outline="none";c.ondrop=async e=>{e.preventDefault();c.style.outline="none";await reorder(e.dataTransfer.getData("id"),p.id)}}
        els.photos.appendChild(c);
      });
    }
    async function reorder(did,tid){const a=S.cur;const l=[...(S.map[a]||[])].sort((x,y)=>(x.ordre||0)-(y.ordre||0));const i=l.findIndex(p=>p.id===did),j=l.findIndex(p=>p.id===tid);if(i<0||j<0||i===j)return;const [m]=l.splice(i,1);l.splice(j,0,m);l.forEach((p,k)=>p.ordre=k+1);S.map[a]=l;renderPhotos(); if(!S.ok||S.ro)return; try{const b=writeBatch(S.db);l.forEach((p,k)=>b.update(doc(S.db,"photos",p.id),{ordre:k+1}));await b.commit();toast("Ordre sauvegardé","success")}catch(e){toast("Erreur ordre","error")}}
    function refreshAlbums(){S.albums=S.albums.map(a=>{const l=S.map[a.nom]||[];return {...a,count:l.length,coverUrl:l[0]?.url||a.coverUrl||""}})}

    // ═══ UPLOAD ══════════════
    function openUpload(){if(!S.cur){toast("Ouvre un album d'abord","info");return} if(S.ro||!S.ok){toast("Upload indisponible en mode local","error");return} els.upload.classList.remove("hidden")}
    function closeUpload(){els.upload.classList.add("hidden");S.queue=[];renderQueue()}
    function queueFiles(files){const ok=new Set(["jpg","jpeg","png","webp","gif"]);[...files].forEach(f=>{const ext=(f.name.split(".").pop()||"").toLowerCase();if(!ok.has(ext)){toast("Fichier ignoré: "+f.name,"error");return}S.queue.push({file:f,preview:URL.createObjectURL(f),progress:0,status:"pending",final:null})});renderQueue()}
    function renderQueue(){els.uList.innerHTML="";S.queue.forEach(i=>{const r=document.createElement("div");r.className="ui";r.innerHTML='<img src="'+i.preview+'"><div><div style="font-size:.84rem;word-break:break-all">'+(i.final||i.file.name)+'</div><div class="pr"><span style="width:'+Math.round(i.progress)+'%"></span></div></div><div style="font-size:.82rem;color:var(--muted)">'+Math.round(i.progress)+'%</div>';els.uList.appendChild(r)})}
    async function uploadAll(){if(!S.queue.length)return;const a=S.cur;const names=new Set((S.map[a]||[]).map(p=>(p.nom||"").toLowerCase()));
      for(const it of S.queue){if(it.status==="done")continue;it.final=dedupe(normalizeFilename(it.file.name),names);names.add(it.final.toLowerCase());renderQueue();
        try{const path=sp(a,it.final);await new Promise((res,rej)=>{const t=uploadBytesResumable(ref(S.st,path),it.file);t.on("state_changed",s=>{it.progress=s.bytesTransferred/s.totalBytes*100;renderQueue()},rej,res)});
          const url=await getDownloadURL(ref(S.st,path));const payload={nom:it.final,album:a,url,storagePath:path,dateAjout:serverTimestamp(),taille:it.file.size,ordre:(S.map[a]?.length||0)+1};
          const dr=await addDoc(collection(S.db,"photos"),payload);if(!S.map[a])S.map[a]=[];S.map[a].push({id:dr.id,...payload,dateAjout:Date.now()});it.status="done";it.progress=100;renderQueue();refreshAlbums();renderPhotos();
        }catch(e){it.status="error";toast("Erreur upload: "+it.file.name,"error")}
      }toast("Upload terminé","success")
    }

    // ═══ SUPPRESSION ═════════
    const confirm=(t,x,ok)=>{els.mT.textContent=t;els.mX.textContent=x;els.m.classList.add("open");const close=()=>{els.m.classList.remove("open");els.mYes.onclick=null};els.mNo.onclick=close;els.mYes.onclick=async()=>{try{await ok()}finally{close()}}};
    async function delSelected(){const a=S.cur;const l=S.map[a]||[];const tg=l.filter(p=>S.sel.has(p.id));if(!tg.length)return;
      if(!warnUsage(tg.map((p)=>p.storagePath),"la suppression"))return;
      confirm("Supprimer la selection","Supprimer "+tg.length+" photo(s) ?",async()=>{for(const p of tg){try{await deleteObject(ref(S.st,p.storagePath))}catch{} await deleteDoc(doc(S.db,"photos",p.id))}
        S.map[a]=l.filter(p=>!S.sel.has(p.id));S.sel.clear();refreshAlbums();renderPhotos();els.bDelSel.classList.add("hidden");toast("Photos supprimées","success")})
    }
    async function delAlbum(){const a=S.cur;const l=S.map[a]||[];if(!warnUsage(l.map((p)=>p.storagePath),"la suppression de l'album"))return;confirm("Supprimer l'album","Supprimer "+a+" et ses "+l.length+" photo(s) ?",async()=>{for(const p of l){try{await deleteObject(ref(S.st,p.storagePath))}catch{} await deleteDoc(doc(S.db,"photos",p.id))}
      delete S.map[a];S.albums=S.albums.filter(x=>x.nom!==a);renderAlbums();toast("Album supprimé","success")})}
    // ═══ ACTIONS PHOTO ═══════
    async function moveBlob(p,newAlbum,newName){const old=p.storagePath,newP=sp(newAlbum,newName);if(old===newP)return;const r=await fetch(p.url);if(!r.ok)throw new Error("Blob source introuvable");const b=await r.blob();await uploadBytes(ref(S.st,newP),b);const url=await getDownloadURL(ref(S.st,newP));try{await deleteObject(ref(S.st,old))}catch{} await updateDoc(doc(S.db,"photos",p.id),{nom:newName,album:newAlbum,storagePath:newP,url});p.nom=newName;p.album=newAlbum;p.storagePath=newP;p.url=url}
    async function renamePhoto(p){if(S.ro||!S.ok){toast("Renommage indisponible en mode local","error");return} const raw=prompt("Nouveau nom du fichier",p.nom);if(!raw)return;let n=normalizeFilename(raw);if(n===p.nom)return;const set=new Set((S.map[p.album]||[]).filter(x=>x.id!==p.id).map(x=>(x.nom||"").toLowerCase()));n=dedupe(n,set);if(!warnUsage([p.storagePath],"le renommage"))return;try{await moveBlob(p,p.album,n);renderPhotos();refreshAlbums();toast("Photo renommée","success")}catch(e){toast("Erreur renommage","error")}}
    async function movePhoto(p){if(S.ro||!S.ok){toast("Déplacement indisponible en mode local","error");return} const t=prompt("Déplacer vers quel album ?",p.album);if(!t)return;const a=nAlbum(t);if(!a||a===p.album)return;const set=new Set((S.map[a]||[]).map(x=>(x.nom||"").toLowerCase()));const n=dedupe(p.nom,set);if(!warnUsage([p.storagePath],"le déplacement"))return;try{await moveBlob(p,a,n);const old=p.album;S.map[old]=(S.map[old]||[]).filter(x=>x.id!==p.id);if(!S.map[a])S.map[a]=[];p.album=a;p.nom=n;p.ordre=S.map[a].length+1;S.map[a].push(p);if(!S.albums.find(x=>x.nom===a))S.albums.push({nom:a,count:0,coverUrl:p.url});refreshAlbums();renderPhotos();toast("Photo déplacée","success")}catch(e){toast("Erreur déplacement","error")}}

    // ═══ LIGHTBOX ════════════
    function openLight(id){const l=sorted(S.cur);const i=l.findIndex(p=>p.id===id);if(i<0)return;S.light={list:l,i};drawLight();$("l").classList.add("open")}
    function drawLight(){const p=S.light.list[S.light.i];if(!p)return;els.lImg.src=p.url;els.lName.textContent=p.nom;els.lIdx.textContent=(S.light.i+1)+" / "+S.light.list.length;els.lDown.href=p.url;els.lDown.download=p.nom;els.lCopy.onclick=async()=>{try{await navigator.clipboard.writeText(p.url||"");toast("URL copiée","success")}catch{toast("Copie impossible","error")}}}
    const lMove=s=>{const n=S.light.list.length;S.light.i=(S.light.i+s+n)%n;drawLight()};

    // ═══ UI / TOASTS ═════════
    function bind(){
      $("bAlbums").onclick=renderAlbums; $("bUploadMain").onclick=openUpload; $("bUploadSide").onclick=openUpload; $("bSort").onclick=()=>els.sort.focus();
      $("bDelSel").onclick=delSelected; $("bDelAlbum").onclick=delAlbum; $("bUpClose").onclick=closeUpload; $("bUpStart").onclick=uploadAll;
      $("bNewAlbum").onclick=async()=>{if(S.ro){toast("Création album indisponible en mode local","error");return} const raw=prompt("Nom du nouvel album ?");if(!raw)return;const n=nAlbum(raw);if(S.albums.find(a=>a.nom===n)){toast("Album déjà existant","info");return}S.albums.push({nom:n,count:0,coverUrl:""});S.map[n]=[];renderAlbums();try{await addDoc(collection(S.db,"albums"),{nom:n,createdAt:serverTimestamp()});toast("Album créé","success")}catch{toast("Album local créé (Firestore KO)","error")}};
      els.sort.onchange=()=>{S.sort=els.sort.value;if(S.cur)renderPhotos()}; els.search.oninput=()=>{S.q=(els.search.value||"").toLowerCase().trim();if(S.cur)renderPhotos();else renderAlbums()};
      els.drop.onclick=()=>els.files.click(); els.files.onchange=e=>{queueFiles(e.target.files||[]);e.target.value=""};
      ["dragenter","dragover"].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.add("drag")}));
      ["dragleave","drop"].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.remove("drag")}));
      els.drop.addEventListener("drop",e=>queueFiles(e.dataTransfer?.files||[]));
      $("lClose").onclick=()=>$("l").classList.remove("open"); $("lPrev").onclick=()=>lMove(-1); $("lNext").onclick=()=>lMove(1);
      $("l").onclick=e=>{if(e.target===$("l"))$("l").classList.remove("open")}; document.addEventListener("keydown",e=>{if(!$("l").classList.contains("open"))return; if(e.key==="Escape")$("l").classList.remove("open"); if(e.key==="ArrowLeft")lMove(-1); if(e.key==="ArrowRight")lMove(1)});
    }

    (async()=>{bind();await init();renderAlbums()})();
  </script></body></html>`;
}

export async function GET() {
  return new Response(html(localManifest(), buildUsageIndex(), getFirebaseClientConfig()), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}


