const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "pawanvoice-68c5e.firebaseapp.com",
  databaseURL: "https://pawanvoice-68c5e-default-rtdb.firebaseio.com",
  projectId: "pawanvoice-68c5e",
  storageBucket: "pawanvoice-68c5e.firebasestorage.app",
  messagingSenderId: "148446327241",
  appId: "1:148446327241:web:6bac9cb9ad0fb530cbb818",
  measurementId: "G-S98P3GBNCK"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
