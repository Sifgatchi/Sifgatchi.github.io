(async function initFirebase() {
  const CONFIG = {
    apiKey: "AIzaSyBkyk-gt3DNWetidpFnSdHmmGKQCao6Ap4",
    authDomain: "sifgatchi.firebaseapp.com",
    projectId: "sifgatchi",
    storageBucket: "sifgatchi.firebasestorage.app",
    messagingSenderId: "511460208225",
    appId: "1:511460208225:web:74cb1aea873a4fba694420",
    measurementId: "G-MNQRRFR7EJ"
  };

  const base = "https://www.gstatic.com/firebasejs/12.17.0/";
  let app, auth, db, fb;

  try {
    const appMod = await import(base + "firebase-app.js");
    const authMod = await import(base + "firebase-auth.js");
    const dbMod = await import(base + "firebase-firestore.js");
    app = appMod.initializeApp(CONFIG);
    auth = authMod.getAuth(app);
    db = dbMod.getFirestore(app);
    fb = {
      appMod, authMod, dbMod,
      doc: (ref, ...path) => dbMod.doc(ref, ...path),
    };
  } catch (err) {
    console.error("Firebase failed to load:", err);
    window.dispatchEvent(new CustomEvent("firebase-error", { detail: String(err) }));
    return;
  }

  const state = { uid: null, email: null, username: null, profile: null };

  const notify = () =>
    window.dispatchEvent(new CustomEvent("mikan-auth", {
      detail: state.uid ? { ...(state.profile || {}), uid: state.uid, email: state.email } : null,
    }));

  async function readProfile(uid) {
    try {
      const d = await fb.dbMod.getDoc(fb.dbMod.doc(db, "users", uid));
      return d.exists() ? d.data() : null;
    } catch (e) { console.error(e); return null; }
  }

  fb.authMod.onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.uid = user.uid;
      state.email = user.email;
      state.profile = await readProfile(user.uid);
      state.username = (state.profile && state.profile.username) || (user.email || "").split("@")[0];
      notify();
    } else {
      state.uid = null; state.email = null; state.username = null; state.profile = null;
      notify();
    }
  });

  const FB = {
    state,

    async signUp(email, password, username, avatar, local = {}) {
      const uname = String(username || "").toLowerCase().trim();
      if (!uname) throw new Error("pick a username first");
      const ud = await fb.dbMod.getDoc(fb.dbMod.doc(db, "usernames", uname));
      if (ud.exists()) throw new Error("that username is taken");
      const cred = await fb.authMod.createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      const profile = {
        username: uname, email, avatar: avatar || "🐱",
        catName: local.catName || "Mikan",
        outfit: local.outfit || "bow",
        catColor: local.catColor || "orange",
        bgColor: local.bgColor || "mint",
        friends: [], stats: { h: 100, th: 100, e: 100, ha: 100 },
        online: true, createdAt: Date.now(), lastSeen: Date.now(),
      };
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "users", uid), profile);
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "usernames", uname), { uid });
      state.uid = uid; state.email = email; state.username = uname; state.profile = profile;
      notify();
    },

    async signIn(email, password) {
      await fb.authMod.signInWithEmailAndPassword(auth, email, password);
    },

    async signInWithGoogle() {
      const provider = new fb.authMod.GoogleAuthProvider();
      await fb.authMod.signInWithPopup(auth, provider);
    },

    async signOut() {
      await fb.authMod.signOut(auth);
    },

    async pushProfile(patch) {
      if (!state.uid) return;
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "users", state.uid), patch, { merge: true });
      state.profile = { ...(state.profile || {}), ...patch };
    },

    async pushStats(s) {
      if (!state.uid) return;
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "users", state.uid),
        { stats: s, online: true, lastSeen: Date.now() }, { merge: true });
      if (state.profile) state.profile.stats = s;
    },

    async pushPresence(on) {
      if (!state.uid) return;
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "users", state.uid),
        { online: on, lastSeen: Date.now() }, { merge: true });
    },

    async setUsername(newName) {
      const old = state.username;
      const uname = String(newName || "").toLowerCase().trim();
      if (!old || old === uname) return;
      const ud = await fb.dbMod.getDoc(fb.dbMod.doc(db, "usernames", uname));
      if (ud.exists()) throw new Error("that username is taken");
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "usernames", uname), { uid: state.uid });
      const od = await fb.dbMod.getDoc(fb.dbMod.doc(db, "usernames", old));
      if (od.exists()) {
        await fb.dbMod.deleteDoc(fb.dbMod.doc(db, "usernames", old));
      }
      await fb.dbMod.setDoc(fb.dbMod.doc(db, "users", state.uid), { username: uname }, { merge: true });
      state.username = uname;
      if (state.profile) state.profile.username = uname;
    },

    async findUser(username) {
      const uname = String(username || "").toLowerCase().trim();
      const ud = await fb.dbMod.getDoc(fb.dbMod.doc(db, "usernames", uname));
      if (!ud.exists()) return null;
      const d = await fb.dbMod.getDoc(fb.dbMod.doc(db, "users", ud.data().uid));
      if (!d.exists()) return null;
      return { ...d.data(), uid: ud.data().uid, username: uname };
    },

    async addFriend(username) {
      const uname = String(username || "").toLowerCase().trim();
      const u = await this.findUser(uname);
      if (!u) throw new Error("no user with that username");
      await fb.dbMod.updateDoc(fb.dbMod.doc(db, "users", state.uid),
        { friends: fb.dbMod.arrayUnion(uname) });
      return u;
    },

    async removeFriend(username) {
      await fb.dbMod.updateDoc(fb.dbMod.doc(db, "users", state.uid),
        { friends: fb.dbMod.arrayRemove(String(username || "").toLowerCase().trim()) });
    },
  };

  window.FB = FB;
  window.dispatchEvent(new CustomEvent("firebase-ready"));
})();
