import { GoogleGenAI, Type } from "@google/genai";

// Ideally, this is initialized with the key from process.env, 
// but for this demo, we assume the environment is set up correctly.
const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API_KEY not found in environment variables.");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

export const generateStreamMetadata = async (topic: string) => {
  const client = getClient();
  if (!client) return { title: "New Live Stream", description: "Join me live!" };

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a catchy, viral-style title and a short, engaging description for a live stream about: "${topic}". 
      The description should be under 200 characters.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["title", "description"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as { title: string; description: string };
  } catch (error) {
    console.error("Error generating metadata:", error);
    // Fallback
    return {
      title: `${topic} - Live Stream`,
      description: `Watch as we dive deep into ${topic}. Streaming now!`
    };
  }
};