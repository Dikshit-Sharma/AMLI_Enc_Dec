const admin = require('firebase-admin');

const ALLOWED_ORIGINS = ['https://amliaes.netlify.app', 'http://localhost:5173', 'http://localhost:8888'];
function getHeaders(event) {
  const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json',
  };
}
function ok(event, data, status) { return { statusCode: status || 200, headers: getHeaders(event), body: JSON.stringify(data) }; }
function err(event, status, msg) { return ok(event, { error: msg || 'Internal server error' }, status || 500); }

const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (admin.apps.length === 0) { admin.initializeApp({ credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT) }); }
const db = admin.firestore();

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      if (params.history) {
        const snap = await db.collection('bsa').doc(params.history).collection('history').orderBy('timestamp', 'desc').limit(50).get();
        return ok(event, { versions: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
      }
      if (params.historyAll) {
        const bsaSnap = await db.collection('bsa').select('api').get();
        const allVersions = [];
        for (const doc of bsaSnap.docs) {
          const histSnap = await db.collection('bsa').doc(doc.id).collection('history').orderBy('timestamp', 'desc').limit(20).get();
          histSnap.docs.forEach(d => allVersions.push({ id: d.id, api: doc.data().api, entryId: doc.id, ...d.data() }));
        }
        allVersions.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return ok(event, { versions: allVersions.slice(0, 100) });
      }
      const snapshot = await db.collection('bsa').orderBy('api', 'asc').limit(2000).get();
      return ok(event, { entries: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const params = event.queryStringParameters || {};
      if (params.action === 'seed') {
        const seedData = [
          { api: "Master360", consumers: [{ name: "NEO2.0 / NEOCS", spoc: "Anika Magoo / Gaurav Rana / Ankur" }, { name: "NEO", spoc: "Vineet Kumar / Sandeep Malhotra" }, { name: "EBOT", spoc: "Aishwarya / Gaurav Rana" }, { name: "DOLPHIN", spoc: "Naman Dadhich" }, { name: "IVR", spoc: "Gopal Kumar" }, { name: "FULFILLMENT / MPRO", spoc: "Himanshu Mehta / Ankush Sachdeva" }, { name: "External Partners: FINCART; PHONEPE; INDWEALTH; POLICYBAZAAR; FINCEPTION; TATADIGITAL; BTSL; INSURANCEDEKHO", spoc: "Vineet / Akash Yadav" }, { name: "MPOWER", spoc: "Atul" }, { name: "UNO", spoc: "Ravi / Anamika" }, { name: "MDIINDIA", spoc: "Sachin sharma" }, { name: "POLICYIQ", spoc: "Rishi Shrivastava / Anirudha Chakraborty" }] },
          { api: "Client360", consumers: [{ name: "NEO2.0 / EBOT / CSBOT", spoc: "Anand Tripathi / Ankur Singhal / Anika Magoo" }, { name: "MPOWER", spoc: "Atul Nalwa" }, { name: "MyFlow / IBPS", spoc: "Uma" }, { name: "BRIEZI / IVR", spoc: "Gopal Kumar" }, { name: "CRMYBL / SuperApp", spoc: "Abhinav Anand / Yaman" }, { name: "IBPSCLAIMS", spoc: "Arpita / Neha Porwal" }, { name: "Yes Bank / Fulfillment", spoc: "Himanshu Mehta" }, { name: "UNO", spoc: "Ravi / Sandeep" }, { name: "INQUIZZITIVE", spoc: "Anuj Kalia" }, { name: "Account Aggregator", spoc: "Aman Kumar Ojha" }, { name: "VYMO", spoc: "Ankush Jagga" }, { name: "Abhed", spoc: "Nisha Rani / Gautam Kukreja" }] },
          { api: "Policy360", consumers: [{ name: "NEO2.0 / EBOT / CSBOT", spoc: "Anand Tripathi / Ankur Singhal / Anika Magoo" }, { name: "NEO / PhonePe / PolicBazaar / FINCART / POLICYEXCHANGE", spoc: "Vineet / Himanshu Sikka" }, { name: "MPOWER", spoc: "Atul" }, { name: "MyFlow / IBPS", spoc: "Uma" }, { name: "BRIEZI / IVR / Valuenable / ACR", spoc: "Gopal" }, { name: "Dolphin", spoc: "Naman Dadhich" }, { name: "Fulfillment", spoc: "Himanshu Mehta / Ankush Sachdeva" }, { name: "UNO", spoc: "Anamika" }, { name: "Account Aggregator", spoc: "Aman Kumar Ojha" }, { name: "VYMO", spoc: "Ankush Jagga" }, { name: "mSpace", spoc: "Yaman Siddiqui / Abhinav Anand" }, { name: "IBPS Claims", spoc: "arpita sachdeva / Tejas" }, { name: "LMS", spoc: "Anuj Kalia / Lalit Jangra" }, { name: "WELLNESSAPP", spoc: "Sadika / Sanesh Nair" }] },
          { api: "Agent360", consumers: [{ name: "NEO2.0 / Agrim", spoc: "Anika Magoo / Gaurav Rana / Ankur Singhal" }, { name: "EBOT / CSBOT", spoc: "Anand Tripathi / Anamika / Ankur singhal" }, { name: "DOLPHIN / FULFILLMENT", spoc: "Naman Dadhich, Ankush Sachdeva / Himanshu" }, { name: "IVR", spoc: "Gopal Kumar" }, { name: "AGENCY2.0", spoc: "Kanchi" }, { name: "MSPACE / PRP", spoc: "Yaman Siddiqui / Abhinav Anand" }, { name: "MPOWER", spoc: "Atul Nalwa" }, { name: "MYFLOW", spoc: "Abhishek Awasthi / Sandeep / Uma" }, { name: "MREC", spoc: "Ankush Jagga" }, { name: "ILLUSTRATIONCALC", spoc: "Atul Nalwa" }, { name: "AXIS / LMS", spoc: "Anuj Kalia / Lalit Jangra / Abhijeet Sahgal" }, { name: "NEO", spoc: "Vineet Kumar / Himanshu Sikka / Ravi Kumar" }, { name: "EAPP", spoc: "Neha Mittal / Nikhil Srivastav / Ayush Taliwal" }, { name: "IBPSCLAIM", spoc: "arpita sachdeva / Tejas" }, { name: "UNO", spoc: "Anamika / Sadika" }, { name: "MSALES", spoc: "Dhiraj / Abhijeet sahgal" }, { name: "PRINTVC", spoc: "Sarayu / Varsha gupta" }] },
          { api: "financial grid", consumers: [{ name: "DOLPHIN", spoc: "Naman Dadhich" }, { name: "MPRO", spoc: "Himanshu Mehta / Ankush Sachdeva" }] },
          { api: "MSA-FSA", consumers: [{ name: "NEO2.0 / EBOT / CSBOT", spoc: "Anand Tripathi / Ankur Singhal / Anika Magoo" }, { name: "NEO / PhonePe / PolicBazaar / FINCART / POLICYEXCHANGE", spoc: "Vineet / Himanshu Sikka" }, { name: "MPOWER", spoc: "Atul" }, { name: "MyFlow / IBPS", spoc: "Uma" }, { name: "BRIEZI / IVR / Valuenable / ACR", spoc: "Gopal" }, { name: "Dolphin", spoc: "Naman Dadhich" }, { name: "Fulfillment", spoc: "Himanshu Mehta / Ankush Sachdeva" }, { name: "UNO", spoc: "Anamika" }, { name: "Account Aggregator", spoc: "Aman Kumar Ojha" }, { name: "VYMO", spoc: "Ankush Jagga" }, { name: "mSpace", spoc: "Yaman Siddiqui / Abhinav Anand" }, { name: "IBPS Claims", spoc: "arpita sachdeva / Tejas" }, { name: "LMS", spoc: "Anuj Kalia / Lalit Jangra" }, { name: "WELLNESSAPP", spoc: "Sadika / Sanesh Nair" }] },
          { api: "TPA Lead identifier", consumers: [{ name: "NEO2.0", spoc: "Anika Magoo / Gaurav Rana / Ankur" }, { name: "NEO", spoc: "Vineet Kumar / Himanshu Sikka / Ravi Kumar" }, { name: "NYVO / GIBL", spoc: "Sai Nandan" }, { name: "DOLPHIN", spoc: "Naman Dadhich" }, { name: "PAYTM", spoc: "Vineet" }, { name: "FULFILLMENT", spoc: "Himanshu Mehta / Ankush Sachdeva" }, { name: "External Partners: PHONEPE; INDWEALTH; FINCEPTION; TATADIGITAL; INSURANCEDEKHO", spoc: "Vineet / Akash Yadav" }, { name: "AXISMAX", spoc: "Tanvi Pandey" }] },
          { api: "criff API", consumers: [{ name: "AWS", spoc: "" }, { name: "DOLPHIN", spoc: "Naman Dadhich" }, { name: "NEO / POLICYBAZAR", spoc: "Vineet Kumar / Himanshu Sikka / Ravi Kumar" }, { name: "NEO2.0", spoc: "Anika Magoo / Gaurav Rana / Ankur Singhal" }, { name: "TATADIGITAL", spoc: "Vineet Kumar" }, { name: "FULFILLMENT / MPR0", spoc: "Ankush Sachdeva / Himanshu" }, { name: "MREC", spoc: "ankkush jagga / kanchi" }, { name: "MYFLOW", spoc: "Uma / Aman Yadav / abhishek awasthi" }, { name: "IBPS_CLAIMS", spoc: "arpita sachdeva / Tejas" }, { name: "CLAIMSWEBSITEJOURNEY", spoc: "sanesh nair / harsh datta" }, { name: "AGENCY2.0", spoc: "Kanchi" }] },
        ];
        const existingSnap = await db.collection('bsa').get();
        const existingApis = new Set();
        existingSnap.forEach(doc => existingApis.add(doc.data().api));
        let created = 0, skipped = 0;
        for (const entry of seedData) {
          if (existingApis.has(entry.api)) { skipped++; continue; }
          await db.collection('bsa').add({ api: entry.api, consumers: entry.consumers, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          created++;
        }
        return ok(event, { ok: true, created, skipped, total: seedData.length });
      }
      const { api, consumers } = body;
      if (!api) return err(event, 400, 'api is required');
      const ref = await db.collection('bsa').add({ api, consumers: consumers || [], createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(event, { id: ref.id });
    }
    if (event.httpMethod === 'PUT') {
      const { id, api, consumers, bulkUpdate } = JSON.parse(event.body || '{}');
      if (!id && !bulkUpdate) return err(event, 400, 'id is required');
      if (bulkUpdate && bulkUpdate.ids?.length > 0) {
        const batch = db.batch();
        for (const entryId of bulkUpdate.ids) {
          const docRef = db.collection('bsa').doc(entryId);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const old = docSnap.data();
            const newConsumers = (old.consumers || []).map(c => bulkUpdate.newSpoc !== undefined ? { ...c, spoc: bulkUpdate.newSpoc } : c);
            batch.update(docRef, { consumers: newConsumers, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            batch.set(docRef.collection('history').doc(), { before: { consumers: old.consumers }, after: { consumers: newConsumers }, changeType: 'bulk-edit', detail: bulkUpdate.newSpoc !== undefined ? `SPOC → ${bulkUpdate.newSpoc}` : '', timestamp: admin.firestore.FieldValue.serverTimestamp() });
          }
        }
        await batch.commit();
        return ok(event, { ok: true, updated: bulkUpdate.ids.length });
      }
      const docRef = db.collection('bsa').doc(id);
      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;
      const updateData = {};
      if (api !== undefined) updateData.api = api;
      if (consumers !== undefined) updateData.consumers = consumers;
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await docRef.update(updateData);
      if (oldData) {
        await docRef.collection('history').doc().set({ before: { api: oldData.api, consumers: oldData.consumers }, after: { api: updateData.api || oldData.api, consumers: updateData.consumers || oldData.consumers }, changeType: 'edit', timestamp: admin.firestore.FieldValue.serverTimestamp() });
      }
      return ok(event, { ok: true });
    }
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return err(event, 400, 'id is required');
      await db.collection('bsa').doc(id).delete();
      return ok(event, { ok: true });
    }
    return err(event, 405, 'Method not allowed');
  } catch (e) { console.error('bsa error:', e); return err(event, 500, 'Internal server error'); }
};

module.exports = { handler };
