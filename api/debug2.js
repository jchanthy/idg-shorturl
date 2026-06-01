export default async function handler(req, res) {
  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/links`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({error: e.message});
  }
}
