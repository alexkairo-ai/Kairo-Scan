import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
 apiKey: "AIzaSyBBREaX2zXTrfn0dYpKC03oI6nS3megdtQ",
 authDomain: "kairo-scan-chat.firebaseapp.com",
 projectId: "kairo-scan-chat",
 storageBucket: "kairo-scan-chat.firebasestorage.app",
 messagingSenderId: "848632257072",
 appId: "1:848632257072:web:4ebfde0ea886cd28ecebf5",
 measurementId: "G-MHBJGF0F8S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const groups = [
 { id:'group_general', title:'Общий' },
 { id:'group_pila', title:'Пила' },
 { id:'group_hdf', title:'ХДФ' },
 { id:'group_kromka', title:'Кромка' },
 { id:'group_prisadka', title:'Присадка' },
 { id:'group_upakovka', title:'Упаковка' },
];

const myNameEl = document.getElementById('myName');
const changeNameBtn = document.getElementById('changeName');
const groupList = document.getElementById('groupList');
const dmList = document.getElementById('dmList');
const dmName = document.getElementById('dmName');
const dmOpen = document.getElementById('dmOpen');
const roomTitle = document.getElementById('roomTitle');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('sendForm');
const msgInput = document.getElementById('msgInput');
const searchMsg = document.getElementById('searchMsg');
const notifyBtn = document.getElementById('notifyBtn');
const backBtn = document.getElementById('backBtn');

const overlay = document.getElementById('nameOverlay');
const nameInput = document.getElementById('nameInput');
const saveName = document.getElementById('saveName');

let myName = (localStorage.getItem('workerName') || '').trim();
let myKey = '';
let currentRoomId = '';
let unsubMessages = null;
let allMessages = [];
let lastSeenTs =0;

let pinned = new Set(JSON.parse(localStorage.getItem('pinnedGroups')||'[]'));
let unread = JSON.parse(localStorage.getItem('unreadCounts')||'{}');
let roomButtons = {};

/* звук */
let soundEnabled = localStorage.getItem('chatSound') === '1';
let audioCtx = null;

function initAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function beep(){
 if(!soundEnabled) return;
 initAudio();
 const o = audioCtx.createOscillator();
 const g = audioCtx.createGain();
 o.frequency.value =880; g.gain.value =0.03;
 o.connect(g).connect(audioCtx.destination);
 o.start(); setTimeout(()=>o.stop(),120);
}

function norm(s){ return String(s||'').trim().toLowerCase(); }
function hash(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h)+s.charCodeAt(i); return (h>>>0).toString(36); }
function dmRoomId(a,b){ const [k1,k2]=[norm(a),norm(b)].sort(); return 'dm_'+hash(k1+'|'+k2); }

function getNameFromQuery(){
 const p = new URLSearchParams(location.search);
 return (p.get('name')||'').trim();
}

function showNameOverlay(show){ overlay.style.display = show ? 'flex' : 'none'; }
function ensureName(){
 if(!myName){
 const fromQuery = getNameFromQuery();
 if(fromQuery){ myName = fromQuery; localStorage.setItem('workerName', myName); }
 }
 if(!myName){ showNameOverlay(true); }
 else { myKey=norm(myName); myNameEl.textContent=myName; }
}

saveName.onclick=()=>{
 const n=nameInput.value.trim(); if(!n) return;
 myName=n; localStorage.setItem('workerName',myName);
 myKey=norm(myName); myNameEl.textContent=myName;
 showNameOverlay(false); initRooms();
};
changeNameBtn.onclick=()=>{ nameInput.value=myName||''; showNameOverlay(true); };

backBtn.onclick = ()=>{
 try{
 if(window.opener && !window.opener.closed){ window.opener.focus(); window.close(); }
 else location.href='index.html';
 }catch(e){ location.href='index.html'; }
};

async function initAuth(){ await signInAnonymously(auth); }

function setUnread(roomId, val){
 unread[roomId] = val;
 localStorage.setItem('unreadCounts', JSON.stringify(unread));
 updateRoomBadge(roomId);
}

function updateRoomBadge(roomId){
 const btn = roomButtons[roomId];
 if(!btn) return;
 const badge = btn.querySelector('.badge');
 const n = unread[roomId] ||0;
 badge.style.display = n>0 ? 'inline-block' : 'none';
 badge.textContent = n;
}

function renderGroups(){
 groupList.innerHTML='';
 const sorted=[...groups].sort((a,b)=>{
 const ap=pinned.has(a.id)?0:1;
 const bp=pinned.has(b.id)?0:1;
 if(ap!==bp) return ap-bp;
 return a.title.localeCompare(b.title,'ru');
 });

 sorted.forEach(g=>{
 const btn=document.createElement('button');
 btn.classList.toggle('pinned', pinned.has(g.id));
 btn.innerHTML = `${g.title}<span class="pin">📌</span><span class="badge"></span>`;
 btn.onclick=()=>openRoom(g.id,g.title);
 btn.oncontextmenu=(e)=>{ e.preventDefault(); togglePin(g.id); };
 btn.querySelector('.pin').onclick=(e)=>{ e.stopPropagation(); togglePin(g.id); };
 roomButtons[g.id]=btn;
 updateRoomBadge(g.id);
 groupList.appendChild(btn);
 });
}

function togglePin(id){
 if(pinned.has(id)) pinned.delete(id); else pinned.add(id);
 localStorage.setItem('pinnedGroups', JSON.stringify([...pinned]));
 renderGroups();
}

async function ensureGroupDocs(){
 for(const g of groups){
 const ref=doc(db,'rooms',g.id);
 const snap=await getDoc(ref);
 if(!snap.exists()) await setDoc(ref,{type:'group',title:g.title,createdAt:serverTimestamp()});
 }
}

function addRoomUnreadListener(roomId){
 const q=query(collection(db,'rooms',roomId,'messages'), orderBy('ts','asc'));
 let first=true;
 onSnapshot(q, snap=>{
 if(first){
 let cnt=0;
 snap.forEach(d=>{
 const m=d.data();
 const ts=m.ts?.toMillis?m.ts.toMillis():0;
 if(roomId!==currentRoomId && ts>lastSeenTs && m.from!==myName) cnt++;
 });
 if(cnt) setUnread(roomId, cnt);
 first=false;
 }else{
 snap.docChanges().forEach(ch=>{
 if(ch.type==='added'){
 const m=ch.doc.data();
 if(roomId!==currentRoomId && m.from!==myName){
 setUnread(roomId, (unread[roomId]||0)+1);
 notifyNew(m);
 }
 }
 });
 }
 });
}

function loadDmRooms(){
 const q=query(collection(db,'rooms'), where('participantsKey','array-contains', myKey));
 onSnapshot(q, snap=>{
 dmList.innerHTML='';
 snap.forEach(docSnap=>{
 const r=docSnap.data(); if(r.type!=='dm') return;
 const keys=r.participantsKey||[];
 const names=r.participantsDisplay||[];
 const i=keys.indexOf(myKey);
 const otherName=(i===0?names[1]:names[0])||'Собеседник';

 const btn=document.createElement('button');
 btn.innerHTML = `${otherName}<span class="badge"></span>`;
 btn.onclick=()=>openRoom(docSnap.id,'Личное: '+otherName);
 roomButtons[docSnap.id]=btn;
 updateRoomBadge(docSnap.id);
 dmList.appendChild(btn);

 addRoomUnreadListener(docSnap.id);
 });
 });
}

async function openDm(other){
 const otherName=other.trim(); if(!otherName) return;
 const roomId=dmRoomId(myName, otherName);
 const k1=norm(myName), k2=norm(otherName);
 await setDoc(doc(db,'rooms',roomId),{
 type:'dm', participantsKey:[k1,k2], participantsDisplay:[myName,otherName], updatedAt:serverTimestamp()
 },{merge:true});
 openRoom(roomId,'Личное: '+otherName);
}

function openRoom(roomId,title){
 currentRoomId=roomId; roomTitle.textContent=title;
 setUnread(roomId,0);

 if(unsubMessages) unsubMessages();
 messagesEl.innerHTML=''; allMessages=[]; lastSeenTs=0;

 const q=query(collection(db,'rooms',roomId,'messages'), orderBy('ts','asc'));
 unsubMessages=onSnapshot(q, snap=>{
 allMessages = snap.docs.map(d=>({id:d.id, ...d.data()}));
 renderMessages();
 const last = allMessages[allMessages.length-1];
 lastSeenTs = last?.ts?.toMillis ? last.ts.toMillis() :0;
 });
}

function renderMessages(){
 const term = searchMsg.value.trim().toLowerCase();
 messagesEl.innerHTML='';
 allMessages.forEach(m=>{
 if(term && !(m.text||'').toLowerCase().includes(term)) return;
 const row=document.createElement('div');
 row.className='msg'+(m.from===myName?' me':'');
 row.dataset.id = m.id;
 row.dataset.from = m.from || '';
 const time=m.ts?.toDate?m.ts.toDate().toLocaleTimeString().slice(0,5):'';
 row.innerHTML = `
 <div class="bubble">${m.text ? m.text : ''}</div>
 <div class="meta">${m.from||''} ${time}</div>
 `;
 bindLongPress(row, m);
 messagesEl.appendChild(row);
 });
 messagesEl.scrollTop=messagesEl.scrollHeight;
}

function bindLongPress(el, msg){
 let timer=null;
 const start=()=>{ timer=setTimeout(()=>onHold(msg),500); };
 const cancel=()=>{ if(timer) clearTimeout(timer); timer=null; };
 el.addEventListener('pointerdown', start);
 el.addEventListener('pointerup', cancel);
 el.addEventListener('pointerleave', cancel);
 el.addEventListener('contextmenu', (e)=>{ e.preventDefault(); onHold(msg); });
}

async function onHold(msg){
 if(msg.from!==myName) return;
 const action = prompt('1 — Изменить\n2 — Удалить', '');
 if(action==='1'){
 const newText = prompt('Новый текст:', msg.text||'');
 if(newText!==null){
 const ref = doc(db,'rooms',currentRoomId,'messages',msg.id);
 await updateDoc(ref, { text:newText });
 }
 }
 if(action==='2'){
 if(confirm('Удалить сообщение?')){
 const ref = doc(db,'rooms',currentRoomId,'messages',msg.id);
 await deleteDoc(ref);
 }
 }
}

searchMsg.oninput=renderMessages;

sendForm.onsubmit=async (e)=>{
 e.preventDefault();
 const text=msgInput.value.trim();
 if(!text || !currentRoomId) return;
 await addDoc(collection(db,'rooms',currentRoomId,'messages'),{ text, from:myName, ts:serverTimestamp() });
 msgInput.value='';
};

dmOpen.onclick=()=>openDm(dmName.value);

notifyBtn.onclick=async ()=>{
 if(Notification.permission!=='granted') await Notification.requestPermission();
 soundEnabled = !soundEnabled;
 localStorage.setItem('chatSound', soundEnabled ? '1' : '0');
 alert(soundEnabled ? 'Уведомления + звук включены' : 'Звук выключен');
};

function notifyNew(m){
 if(Notification.permission!=='granted') return;
 if(!m || m.from===myName) return;
 new Notification(`Сообщение от ${m.from}`, { body: m.text||'', silent:true });
 beep();
}

async function initRooms(){
 await initAuth();
 renderGroups();
 await ensureGroupDocs();
 groups.forEach(g=>addRoomUnreadListener(g.id));
 loadDmRooms();
 openRoom('group_general','Общий');
}

ensureName();
if(myName) initRooms();
