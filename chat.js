import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ====== ВСТАВЬТЕ СВОЙ CONFIG ====== */
const firebaseConfig = {
 apiKey: "XXXX",
 authDomain: "XXXX.firebaseapp.com",
 projectId: "XXXX",
 storageBucket: "XXXX.appspot.com",
 messagingSenderId: "XXXX",
 appId: "XXXX"
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

const roomTitle = document.getElementById('roomTitle');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('sendForm');
const msgInput = document.getElementById('msgInput');

const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menuBtn');
const backBtn = document.getElementById('backBtn');
const groupList = document.getElementById('groupList');
const dmList = document.getElementById('dmList');
const dmName = document.getElementById('dmName');
const dmOpen = document.getElementById('dmOpen');

const urlParams = new URLSearchParams(location.search);
const myName = (urlParams.get('name') || localStorage.getItem('workerName') || 'Гость').trim();
const myKey = myName.toLowerCase();

let currentRoomId = '';
let unsubMessages = null;
let unsubDmList = null;

function hash(s){
 let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h)+s.charCodeAt(i);
 return (h>>>0).toString(36);
}
function dmRoomId(a,b){
 const [k1,k2] = [a.toLowerCase(), b.toLowerCase()].sort();
 return 'dm_' + hash(k1+'|'+k2);
}

menuBtn.onclick = ()=> menu.classList.toggle('hidden');
backBtn.onclick = ()=> history.back();

async function initAuth(){
 await signInAnonymously(auth);
}

function renderGroups(){
 groupList.innerHTML = '';
 groups.forEach(g=>{
 const btn = document.createElement('button');
 btn.textContent = g.title;
 btn.onclick = ()=> openRoom(g.id, g.title);
 groupList.appendChild(btn);
 });
}

async function ensureGroupDocs(){
 for(const g of groups){
 const ref = doc(db, 'rooms', g.id);
 const snap = await getDoc(ref);
 if(!snap.exists()){
 await setDoc(ref, { type:'group', title:g.title, createdAt:serverTimestamp() });
 }
 }
}

function loadDmRooms(){
 if(unsubDmList) unsubDmList();
 const q = query(collection(db,'rooms'), where('participantsKey','array-contains', myKey));
 unsubDmList = onSnapshot(q, snap=>{
 dmList.innerHTML = '';
 snap.forEach(docSnap=>{
 const r = docSnap.data();
 if(r.type !== 'dm') return;
 const keys = r.participantsKey || [];
 const names = r.participantsDisplay || [];
 const i = keys.indexOf(myKey);
 const otherName = (i===0? names[1]: names[0]) || 'Собеседник';

 const btn = document.createElement('button');
 btn.textContent = otherName;
 btn.onclick = ()=> openRoom(docSnap.id, 'Личное: '+otherName);
 dmList.appendChild(btn);
 });
 });
}

async function openDm(other){
 const otherName = other.trim();
 if(!otherName) return;

 const roomId = dmRoomId(myName, otherName);
 const k1 = myName.toLowerCase(), k2 = otherName.toLowerCase();
 const ref = doc(db, 'rooms', roomId);

 await setDoc(ref, {
 type:'dm',
 participantsKey:[k1,k2],
 participantsDisplay:[myName, otherName],
 updatedAt:serverTimestamp()
 }, {merge:true});

 openRoom(roomId, 'Личное: ' + otherName);
}

function openRoom(roomId, title){
 currentRoomId = roomId;
 roomTitle.textContent = title;
 menu.classList.add('hidden');

 if(unsubMessages) unsubMessages();
 messagesEl.innerHTML = '';

 const q = query(collection(db,'rooms',roomId,'messages'), orderBy('ts','asc'));
 unsubMessages = onSnapshot(q, snap=>{
 messagesEl.innerHTML = '';
 snap.forEach(d=>{
 const m = d.data();
 const row = document.createElement('div');
 row.className = 'msg ' + (m.from === myName ? 'outgoing' : 'incoming');

 const time = m.ts?.toDate ? m.ts.toDate().toLocaleTimeString().slice(0,5) : '';
 row.innerHTML = `
 <div class="bubble">${(m.text||'')}</div>
 <div class="meta">${m.from||''} ${time}</div>
 `;
 messagesEl.appendChild(row);
 });
 messagesEl.scrollTop = messagesEl.scrollHeight;
 });
}

sendForm.onsubmit = async (e)=>{
 e.preventDefault();
 const text = msgInput.value.trim();
 if(!text || !currentRoomId) return;

 await addDoc(collection(db,'rooms',currentRoomId,'messages'), {
 text,
 from: myName,
 ts: serverTimestamp()
 });
 msgInput.value = '';
};

dmOpen.onclick = ()=> openDm(dmName.value);

(async ()=>{
 await initAuth();
 renderGroups();
 await ensureGroupDocs();
 loadDmRooms();
 openRoom('group_general','Общий');
})();
