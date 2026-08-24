import { GoogleGenAI, Type } from "@google/genai";
import { auth } from "./firebase";

// Helper function to get an authenticated GoogleGenAI client
const getAIClient = async (): Promise<GoogleGenAI> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User must be authenticated to use the Gemini API proxy.");
  }
  const idToken = await currentUser.getIdToken(true);
  
  // Base path routing to local reverse proxy
  const proxyBaseUrl = `${window.location.origin}/api-proxy`;

  return new GoogleGenAI({
    // We send a dummy apiKey because the SDK requires it or warns, but our proxy ignores it
    apiKey: "dummy-key",
    httpOptions: {
      baseUrl: proxyBaseUrl,
      headers: {
        "Authorization": `Bearer ${idToken}`
      }
    }
  });
};

export const generateSmartAliases = async (originalUrl: string): Promise<string[]> => {
  try {
    const ai = await getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate 3 short, creative, and memorable URL aliases for this link: ${originalUrl}. 
      The aliases should be URL-safe (hyphens allowed, no spaces). 
      Keep them under 15 characters.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aliases: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of suggested aliases"
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || '{"aliases": []}');
    return json.aliases || [];
  } catch (error) {
    console.error("Error generating aliases:", error);
    return [];
  }
};

export const generateTags = async (originalUrl: string): Promise<string[]> => {
  try {
    const ai = await getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze this URL and suggest 3 short categorization tags: ${originalUrl}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || '{"tags": []}');
    return json.tags || [];
  } catch (error) {
    console.error("Error generating tags:", error);
    return ["uncategorized"];
  }
};