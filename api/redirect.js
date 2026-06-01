export default async function handler(req, res) {
  try {
    const { alias } = req.query;
    if (!alias) {
      return res.redirect(302, '/');
    }

    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ error: "Missing VITE_FIREBASE_PROJECT_ID environment variable", envKeys: Object.keys(process.env) });
    }

    // 1. Query Firestore via REST API to find the short link by alias
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'links' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'alias' },
            op: 'EQUAL',
            value: { stringValue: alias }
          }
        },
        limit: 1
      }
    };

    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: "Firestore query failed", status: response.status, details: errorText });
    }

    const data = await response.json();
    
    // If empty result, Firestore returns an array with just { readTime: '...' }
    if (!data || data.length === 0 || !data[0].document) {
      return res.status(404).json({ error: "Link not found in database", alias: alias, projectId: projectId, rawData: data });
    }

    const doc = data[0].document;
    const fields = doc.fields;
    
    const originalUrl = fields.originalUrl?.stringValue;
    const expiresAtObj = fields.expiresAt;
    let expiresAt = null;
    
    if (expiresAtObj) {
        expiresAt = expiresAtObj.integerValue || expiresAtObj.doubleValue || expiresAtObj.stringValue;
    }
    
    if (!originalUrl) {
      return res.status(500).json({ error: "Original URL is missing in the database document" });
    }

    // 2. Check Expiration
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10);
      if (Date.now() > expirationTime) {
        // Expired link
        return res.status(410).json({ error: "Link has expired" });
      }
    }

    // 3. Increment Clicks (Fire and forget, non-blocking!)
    const updateDocument = async () => {
       try {
         const currentClicks = parseInt(fields.totalClicks?.integerValue || fields.totalClicks?.doubleValue || '0', 10);
         const newClicks = currentClicks + 1;
         
         const today = new Date().toISOString().split('T')[0];
         let historyArray = fields.clickHistory?.arrayValue?.values || [];
         
         // Find if today exists
         let foundToday = false;
         let newHistoryArray = historyArray.map(item => {
            const date = item.mapValue?.fields?.date?.stringValue;
            let count = parseInt(item.mapValue?.fields?.count?.integerValue || item.mapValue?.fields?.count?.doubleValue || '0', 10);
            if (date === today) {
                foundToday = true;
                count += 1;
            }
            return {
                mapValue: {
                    fields: {
                        date: { stringValue: date },
                        count: { integerValue: count.toString() }
                    }
                }
            };
         });
         
         if (!foundToday) {
             newHistoryArray.push({
                 mapValue: {
                     fields: {
                         date: { stringValue: today },
                         count: { integerValue: "1" }
                     }
                 }
             });
             // Keep last 30 days
             if (newHistoryArray.length > 30) {
                 newHistoryArray.shift();
             }
         }

         const docName = doc.name; // projects/../databases/(default)/documents/links/{id}
         const patchUrl = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=totalClicks&updateMask.fieldPaths=clickHistory`;
         
         await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: {
                    totalClicks: { integerValue: newClicks.toString() },
                    clickHistory: { arrayValue: { values: newHistoryArray } }
                }
            })
         });
       } catch (e) {
           console.error("Failed to update clicks:", e);
       }
    };

    // Trigger update in background (Vercel allows this to finish if we don't await, though it might occasionally get cut off when the function sleeps. It's usually fine for analytics)
    updateDocument();

    // 4. Redirect instantly!
    // Using 302 Temporary Redirect so that every click hits this serverless function and counts analytics.
    return res.redirect(302, originalUrl);

  } catch (error) {
    return res.status(500).json({ error: "Backend redirect error", message: error.message });
  }
}
