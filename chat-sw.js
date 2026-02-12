/* chat-sw.js */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
 apiKey: "AIzaSyBBREaX2zXTrfn0dYpKC03oI6nS3megdtQ",
 authDomain: "kairo-scan-chat.firebaseapp.com",
 projectId: "kairo-scan-chat",
 storageBucket: "kairo-scan-chat.firebasestorage.app",
 messagingSenderId: "848632257072",
 appId: "1:848632257072:web:4ebfde0ea886cd28ecebf5",
 measurementId: "G-MHBJGF0F8S"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
 const title = payload?.notification?.title || 'Чат';
 const body = payload?.notification?.body || '';
 const data = payload?.data || {};
 self.registration.showNotification(title, {
 body,
 data,
 icon: '/Kairo-Scan/android-chrome-192x192.png',
 badge: '/Kairo-Scan/android-chrome-192x192.png'
 });
});

self.addEventListener('notificationclick', (event)=>{
 event.notification.close();
 const url = (event.notification.data && event.notification.data.url) || '/Kairo-Scan/chat.html';
 event.waitUntil(
 clients.matchAll({type:'window', includeUncontrolled:true}).then((list)=>{
 for(const client of list){
 if(client.url.includes('chat.html')) return client.focus();
 }
 return clients.openWindow(url);
 })
 );
});