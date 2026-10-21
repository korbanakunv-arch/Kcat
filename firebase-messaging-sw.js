/* KCAT push service worker. Letakkan di folder yang sama dengan index.html */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyCBMmtEoOqy_HQ4QIxXB8jxivT86IRDqC0',authDomain:'kcat-10a8f.firebaseapp.com',projectId:'kcat-10a8f',storageBucket:'kcat-10a8f.firebasestorage.app',messagingSenderId:'357416876079',appId:'1:357416876079:web:8a810955a0ba45623d6eda'});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(async p=>{
  const d=p.data||{};
  const cs=await clients.matchAll({type:'window',includeUncontrolled:true});
  if(cs.some(c=>c.visibilityState==='visible'))return; /* aplikasi sedang dibuka: cukup notifikasi di dalam aplikasi */
  return self.registration.showNotification(d.title||'KCAT',{body:d.body||'',tag:d.tag||d.mid||'kcat',data:{room:d.room}});
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const rid=e.notification.data&&e.notification.data.room;
  e.waitUntil((async()=>{
    const cs=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(cs[0]){await cs[0].focus();if(rid)cs[0].postMessage({kcOpen:rid});return}
    await clients.openWindow(self.registration.scope+(rid?'?room='+encodeURIComponent(rid):''));
  })());
});
