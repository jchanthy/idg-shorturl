export default async function handler(req, res) {
  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const { alias } = req.query;

    res.status(200).json({
      success: true,
      projectId: projectId ? "SET" : "MISSING",
      apiKey: apiKey ? "SET" : "MISSING",
      alias: alias || "MISSING",
      query: req.query
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
