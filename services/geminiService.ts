import { GoogleGenAI, Type } from "@google/genai";

export async function suggestHabits(childName: string, childAge: number): Promise<string[]> {
  try {
    // FIX: Removed the check for process.env.API_KEY as per the coding guidelines.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Sugira 3 hábitos diários, simples, divertidos e apropriados para a idade de uma criança de ${childAge} anos chamada ${childName}.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    habits: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING
                        }
                    }
                }
            }
        }
    });

    const jsonString = response.text.trim();
    const result = JSON.parse(jsonString);
    
    if (result.habits && Array.isArray(result.habits)) {
        return result.habits;
    }
    return [];

  } catch (error) {
    console.error("Erro ao chamar a API Gemini:", error);
    return ["Não foi possível buscar sugestões no momento."];
  }
}
