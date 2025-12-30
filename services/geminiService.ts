// Fix: Import specific response and operation types from the Gemini API.
// Fix: Removed non-existent 'GenerateContentStreamResponse' type from import.
import { GoogleGenAI, Content, Part, Type, GenerateContentResponse, GenerateImagesResponse, GenerateVideosOperation, Modality, Chat } from "@google/genai";
import { ChatMode, Attachment, Message, ProjectFiles, AvoVersionId, ChatModeId, ThinkConfig, CanvasAIResponseNode } from '../types';
import { CHAT_MODES } from "../constants";

// --- AI Client Initialization ---
// The Gemini AI client is initialized lazily to prevent the app from crashing on load
// if the API key environment variable is not available. The client will be created
// on the first API call.
let ai: GoogleGenAI | null = null;
const getAi = (): GoogleGenAI => {
    if (!ai) {
        // The API key is obtained exclusively from the environment variable `process.env.API_KEY`
        // as per the strict coding guidelines. This will throw an error if `process` is not
        // defined, but because this function is called lazily (only on user action),
        // the error will be caught by the calling function and displayed in the UI
        // instead of crashing the entire application on startup.
        if (typeof process === 'undefined' || !process.env?.API_KEY) {
            // This error will be caught by the `handleSendMessage` function's try/catch block.
            throw new Error("API_KEY is not configured. Please ensure the environment variable is set.");
        }
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
};
// --- End of AI Client Initialization ---

export const startChat = (systemInstruction: string): Chat => {
    return getAi().chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction
        }
    });
};


/**
 * A higher-order function that wraps an API call with retry logic.
 * It specifically catches rate limit errors and retries with exponential backoff and jitter.
 * @param apiCall The asynchronous function to call.
 * @param maxRetries The maximum number of retries.
 * @param initialDelay The initial delay in milliseconds before the first retry.
 * @returns The result of the API call.
 */
const withRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 5, initialDelay = 3000): Promise<T> => {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
            lastError = error;
            let isRateLimitError = false;
            
            const errorMessage = error?.message || '';
            // Check for common rate limit indicators in the error message
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.toLowerCase().includes('rate limit')) {
                isRateLimitError = true;
            } else {
                 // Fallback to parsing JSON if the message might contain it
                 const jsonMatch = errorMessage.match(/{.*}/s);
                 if (jsonMatch) {
                    try {
                        const errorJson = JSON.parse(jsonMatch[0]);
                        if (errorJson.error?.code === 429 || errorJson.error?.status === 'RESOURCE_EXHAUSTED') {
                            isRateLimitError = true;
                        }
                    } catch (e) {
                       // Ignore json parse error
                    }
                 }
            }

            if (isRateLimitError) {
                if (i < maxRetries - 1) {
                    // Exponential backoff with jitter
                    const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
                    console.warn(`Rate limit error detected. Retrying in ${delay.toFixed(0)}ms... (Attempt ${i + 1}/${maxRetries})`);
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    console.error("Max retries reached for rate limit error.");
                    // Throw a more user-friendly and actionable error message
                    throw new Error("The service is currently under high demand. Please wait for a minute and then try your request again.");
                }
            } else {
                // Not a retriable error, throw it immediately
                throw error;
            }
        }
    }
    // This should not be reachable if logic is correct, but satisfies TypeScript
    throw lastError || new Error("An unexpected error occurred after multiple retries.");
};


// --- AVO Pro Enhancements ---
const AVO_PRO_INSTRUCTIONS: Partial<Record<ChatModeId, string>> = {
    coding_expert: "As AVO Pro, your persona is elevated to a world-class principal engineer. When debugging, you MUST provide a deep root-cause analysis, explaining the execution flow that leads to the error. You MUST then offer multiple, complete, and corrected code snippets, each accompanied by a detailed explanation of its approach, its trade-offs (e.g., performance vs. readability vs. scalability), and why it's a robust solution. For code generation, your output MUST be production-grade: modular, reusable, highly efficient, and follow strict industry best practices. Include comprehensive documentation via comments and, if applicable, a brief markdown explanation of the architecture.",
    deep_researcher: "As AVO Pro, your persona is elevated to an expert research analyst. You MUST NOT simply list facts from sources. Your primary function is to synthesize information into a comprehensive, structured report. The report MUST follow this format: 1. **Executive Summary:** A concise, high-level overview of the findings. 2. **Key Findings:** A detailed breakdown of the most critical information, presented with bullet points for clarity. 3. **Deep Analysis:** Go beyond the surface-level data to explore context, trends, and connections. 4. **Perspectives:** A critical section exploring potential implications, counter-arguments, or differing expert viewpoints on the topic. Your analysis must be profound and demonstrate a deep understanding of the subject matter.",
    website_creator: "As AVO Pro, your persona is elevated to a senior full-stack architect. Your focus MUST be on production-grade quality. All generated code MUST be production-ready and include: 1. **Unit Tests:** Automatically include unit tests for critical components and logic using Vitest. 2. **Accessibility:** Strictly implement WAI-ARIA standards, ensuring keyboard navigability, screen reader compatibility, and appropriate alt tags for all images. 3. **Scalability:** Design a project structure that is scalable and well-documented with comments. This instruction applies to the code you generate in the chat.",
    job_search_assistant: "As AVO Pro, your job search assistance is now more comprehensive. For each job, you MUST provide a brief analysis of the company and the role, highlighting key qualifications and potential career growth. Also, suggest 2-3 potential interview questions a candidate might be asked for that specific role based on the job description.",
    travel_planner: "As AVO Pro, your travel planning is now more detailed. For each itinerary, include budget estimates, alternative activity suggestions, and tips for navigating local customs and transportation.",
    creative_writer: "As AVO Pro, your creative writing is more sophisticated. Focus on advanced literary techniques, character development arcs, and provide analysis on narrative structure and pacing when requested.",
    guided_learning: "As AVO Pro, your tutoring is more in-depth. After explaining a concept, you should provide a follow-up quiz with 2-3 questions to test understanding and offer a small project idea or real-world example to solidify the knowledge.",
};

const getEnhancedSystemInstruction = (mode: ChatMode, versionId: AvoVersionId): string => {
    if (versionId === 'avo_pro') {
        const proInstruction = AVO_PRO_INSTRUCTIONS[mode.id];
        if (proInstruction) {
            // Append the enhancement to the base instruction
            return `${mode.systemInstruction}\n\n**AVO Pro Enhancement:** ${proInstruction}`;
        }
    }
    // Return the default instruction if not AVO Pro or no specific enhancement exists
    return mode.systemInstruction;
};
// --- End of AVO Pro Enhancements ---


const dataUrlToPart = (dataUrl: string, mimeType: string): Part => {
  return {
    inlineData: {
      data: dataUrl.split(',')[1],
      mimeType,
    },
  };
};

const mapMessagesToContent = (messages: Message[]): Content[] => {
    return messages
        .filter(msg => msg.text && !msg.text.includes('<!DOCTYPE html>')) // Exclude website code from history
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));
};

export const generateDeepResearchResponse = async (
    prompt: string,
    history: Message[],
    config: ThinkConfig,
    versionId: AvoVersionId = 'avo_1_0'
): Promise<AsyncIterable<GenerateContentResponse>> => {
    const modelName = 'gemini-2.5-flash';
    const contents: Content[] = mapMessagesToContent(history);
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const systemInstruction = `You are an expert AI Analyst operating in "Think Longer" mode. Your purpose is to perform in-depth analysis by breaking down the user's query into logical, sequential steps.

**CRITICAL INSTRUCTIONS:**
1.  **Decomposition:** First, create a plan by breaking the problem into sub-tasks.
2.  **Step-by-Step Execution:** Execute the plan step-by-step.
3.  **Real-time Reasoning Trace:** For each step you complete, you MUST stream your action and its result to the user. Use the following exact format:
    \`[STEP] Step N: [Brief description of the action being taken]. Result: [A concise summary of the outcome of this action].\`
4.  **Evidence (If applicable):** If you use web search, you MUST include evidence for that step in the format:
    \`Evidence: [Source Title](URL)\`
5.  **Final Answer:** After all steps are complete, provide a final, synthesized answer that directly addresses the user's original query. This should be comprehensive and integrate the findings from your steps.
6.  **Conclusion:** End your entire response with a final, brief summary section formatted exactly as:
    \`**Conclusion:** [A 1-2 sentence summary of your final answer.]\`
7.  **Verbosity:** The user has requested a '${config.verbosity}' response. Adjust the level of detail in your final answer accordingly.`;

    // Fix: Map the user's selected time budget to a token budget for the model.
    // This makes the "Think longer" feature functional by instructing the AI
    // to allocate more resources, resulting in a more detailed response and
    // resolving the issue where the request would previously stall.
    let tokenConfig = {};
    switch (config.timeBudget) {
        case 15:
            tokenConfig = {
                maxOutputTokens: 4096,
                thinkingConfig: { thinkingBudget: 2048 },
            };
            break;
        case 60:
            tokenConfig = {
                maxOutputTokens: 16384,
                thinkingConfig: { thinkingBudget: 8192 },
            };
            break;
        case 30:
        default:
            tokenConfig = {
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingBudget: 4096 },
            };
            break;
    }

    return withRetry<AsyncIterable<GenerateContentResponse>>(() => getAi().models.generateContentStream({
        model: modelName,
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            ...(config.useWeb && { tools: [{ googleSearch: {} }] }),
            ...tokenConfig,
        }
    }));
};


export const generateTextResponse = async (
    prompt: string,
    history: Message[],
    mode: ChatMode,
    attachment?: Attachment,
    versionId: AvoVersionId = 'avo_1_0'
// Fix: The type 'GenerateContentStreamResponse' does not exist in '@google/genai'. The return type for a streaming response is an async iterable of 'GenerateContentResponse'.
): Promise<AsyncIterable<GenerateContentResponse>> => {
    const modelName = 'gemini-2.5-flash';
    const contents: Content[] = mapMessagesToContent(history);
    
    const userParts: Part[] = [{ text: prompt }];
    if (attachment) {
        userParts.unshift(dataUrlToPart(attachment.dataUrl, attachment.type));
    }
    contents.push({ role: 'user', parts: userParts });

    const systemInstruction = getEnhancedSystemInstruction(mode, versionId);

    // Determine if the model should use its "thinking" budget. For creative or
    // research tasks, thinking provides higher quality results. For direct tasks
    // like coding, disabling thinking gives a faster response.
    const requiresDeepThinking = [
        'deep_researcher',
        'creative_writer',
        'guided_learning',
        'strategic_thinker'
    ].includes(mode.id);

    // Fix: Explicitly type the return value of withRetry to ensure `stream` is an async iterable. The generic type is updated to match the function's return signature.
    return withRetry<AsyncIterable<GenerateContentResponse>>(() => getAi().models.generateContentStream({
        model: modelName,
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            // Conditionally disable thinking for faster responses on certain tasks.
            ...(requiresDeepThinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
            // Enable search grounding for researcher, the default AvoMind persona, the job assistant, and the latest news mode.
            ...((mode.id === 'deep_researcher' || mode.id === 'neutral' || mode.id === 'job_search_assistant' || mode.id === 'latest_news') && { tools: [{ googleSearch: {} }] }),
        }
    }));
};

export const generateImageResponse = async (prompt: string): Promise<string> => {
    // Clean the prompt to remove conversational fluff that might confuse the image model.
    let cleanPrompt = prompt.trim();
    const prefixesToRemove = [
        "create a new story of", "create a story of", "a story of",
        "create an image of", "generate an image of", "make an image of",
        "create a picture of", "generate a picture of", "make a picture of"
    ];
    
    for (const prefix of prefixesToRemove) {
        if (cleanPrompt.toLowerCase().startsWith(prefix)) {
            cleanPrompt = cleanPrompt.substring(prefix.length).trim();
            break;
        }
    }

    let styleHint = '';
    // Regex to find a four-digit year, being careful not to match random numbers.
    // Look for years in a reasonable range (e.g., 1900-2099) that are likely to be style hints.
    const yearMatch = cleanPrompt.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
        const year = yearMatch[0];
        // Add a style hint and remove the year from the prompt to avoid redundancy.
        styleHint = `, in the style of a photograph from ${year}`;
        cleanPrompt = cleanPrompt.replace(yearMatch[0], '').replace(/, ,/g, ',').trim();
    }

    const enhancedPrompt = `A high-quality, detailed, photorealistic image of: ${cleanPrompt}${styleHint}`;

    const response = await withRetry<GenerateImagesResponse>(() => getAi().models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: enhancedPrompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg'
        }
    }));
    
    // Fix: Added a defensive check to handle cases where the API returns no images due to safety filters.
    // This prevents the application from crashing and provides a clear error message to the user.
    if (!response.generatedImages || response.generatedImages.length === 0 || !response.generatedImages[0].image) {
        throw new Error("I was unable to create an image for that prompt. This can happen due to safety policies, especially for prompts involving real people. Please try a different, more general description.");
    }
    
    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const generatePromptSuggestions = async (failedPrompt: string): Promise<string[]> => {
  const prompt = `An AI image generation prompt was rejected for safety reasons. The rejected prompt was: "${failedPrompt}".
  Please provide 3 creative, alternative prompts that are more general and less likely to be rejected. The new prompts should avoid referencing specific people's names but can describe roles or concepts.
  Return the suggestions as a valid JSON array of 3 strings. For example: ["a photo of a generic politician giving a speech", "an oil painting of a famous scientist from the 19th century", "a logo for a tech company named 'Innovate'"].
  
  Provide only the JSON array of 3 strings.`;

  const response = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  }));

  try {
    const suggestions = JSON.parse(response.text);
    if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string') && suggestions.length > 0) {
      return suggestions;
    }
    throw new Error("Invalid suggestion format from AI.");
  } catch (e) {
    console.error("Failed to parse prompt suggestions:", response.text, e);
    // Fallback suggestions in case of parsing failure
    return [
      `An abstract painting representing "${failedPrompt}"`,
      `A symbolic image for the concept of "${failedPrompt}"`,
      `A cartoon character inspired by "${failedPrompt}"`
    ];
  }
};


export const editImage = async (prompt: string, attachment: Attachment): Promise<{ imageUrl: string; text: string }> => {
    const imagePart = dataUrlToPart(attachment.dataUrl, attachment.type);
    const textPart = { text: prompt };

    const response = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [imagePart, textPart]
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    }));

    let imageUrl = '';
    let text = '';

    if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                const mimeType = part.inlineData.mimeType;
                imageUrl = `data:${mimeType};base64,${base64ImageBytes}`;
            } else if (part.text) {
                text = part.text;
            }
        }
    }
    
    if (!imageUrl) {
        throw new Error("The AI did not return an edited image. It might have misunderstood the request or the content policy was triggered.");
    }

    return { imageUrl, text };
};

export const generateVideo = async (prompt: string, onUpdate: (statusText: string) => void): Promise<{ videoUrl: string; audioDescription: string }> => {
    onUpdate(`🎬 Preparing video generation for: "${prompt}"...`);

    const enhancedPrompt = `photorealistic, cinematic, 4k, ultra realistic video of ${prompt}, professional color grading, high detail`;

    let operation: GenerateVideosOperation;
    try {
        operation = await getAi().models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: enhancedPrompt,
            config: { numberOfVideos: 1 }
        });
    } catch (error) {
        console.error('Video generation failed to initiate:', error);
        throw new Error('Could not start video generation. The service may be temporarily unavailable.');
    }

    const pollingMessages = [
        "Analyzing the prompt and setting the scene...",
        "Generating initial frames...",
        "Rendering high-resolution visuals...",
        "Adding cinematic touches...",
        "Finalizing your video, almost ready..."
    ];
    let messageIndex = 0;

    onUpdate(`⏳ ${pollingMessages[messageIndex]}`);

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        messageIndex = (messageIndex + 1) % pollingMessages.length;
        onUpdate(`⏳ ${pollingMessages[messageIndex]}`);
        
        try {
            operation = await withRetry<GenerateVideosOperation>(() => getAi().operations.getVideosOperation({operation: operation!}), 3, 5000);
        } catch(e) {
            console.error('Polling for video failed permanently after retries', e);
            throw new Error('There was an issue checking the video status. Please try again later.');
        }
    }

    if (operation.error) {
        console.error("Video generation failed during processing:", operation.error);
        throw new Error(`Video generation failed: ${operation.error.message || 'Unknown error'}`);
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

    if (!downloadLink) {
        throw new Error("Video generation completed, but no video URL was returned.");
    }
    
    onUpdate("✅ Video ready! Composing soundtrack and downloading...");
    
    if (typeof process === 'undefined' || !process.env?.API_KEY) {
        throw new Error("API_KEY is not configured. Cannot download generated video.");
    }
    
    const separator = downloadLink.includes('?') ? '&' : '?';
    const videoResponse = await fetch(`${downloadLink}${separator}key=${process.env.API_KEY}`);
    if (!videoResponse.ok) {
        throw new Error(`Failed to download the generated video (status: ${videoResponse.status}).`);
    }

    const videoBlob = await videoResponse.blob();
    const videoUrl = URL.createObjectURL(videoBlob);

    // --- NEW: Generate Audio Description ---
    const audioPrompt = `A user requested a video with the following prompt: "${prompt}". 
    Your task is to create a brief, one-sentence description of the perfect background music and sound effects for this video. 
    Be creative and evocative. For example, for "A knight fighting a dragon", you could suggest "Epic orchestral music with the roar of the dragon, clashing swords, and the knight's shouts."
    
    Respond ONLY with the audio description text.`;

    let audioDescription = "Ambient sound effects matching the scene."; // Default fallback

    try {
        const audioResponse = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: audioPrompt }] }],
            config: {
                thinkingConfig: { thinkingBudget: 0 } // Quick response
            }
        }));
        if (audioResponse.text) {
            audioDescription = audioResponse.text.trim();
        }
    } catch (audioError) {
        console.error("Failed to generate audio description:", audioError);
    }

    return { videoUrl, audioDescription };
};

export const generateCanvasResponse = async (
    prompt: string,
): Promise<CanvasAIResponseNode> => {
    // Fix: Updated the system instruction to explicitly request JSON output without relying on responseMimeType,
    // as it conflicts with the 'googleSearch' tool. This resolves the 400 error.
    const systemInstruction = `You are a strategic research assistant for a visual mind-map canvas. The user has provided a central topic in a node. Your task is to perform in-depth research on this topic and break it down into a structured, hierarchical plan of actionable steps or related, innovative sub-topics.

**CRITICAL INSTRUCTIONS:**
1.  **Use Web Search:** You MUST use your web search tool for any queries that require up-to-date information, research, or factual data (e.g., "jobs in usa", "latest marketing trends", "how to build a PC").
2.  **Strict JSON Output:** Your response MUST be ONLY a single, valid JSON object and nothing else. Do not include markdown fences (\`\`\`json), conversational text, or any other characters outside of the JSON structure.
3.  **JSON Schema:** The JSON object must follow this exact structure:
    \`\`\`json
    {
      "title": "A summary title for the breakdown.",
      "children": [
        {
          "title": "Concise title for the first main idea/step.",
          "children": [
            { "title": "Nested detail for the first idea." },
            { "title": "Another nested detail." }
          ]
        },
        {
          "title": "Concise title for the second main idea/step."
        }
      ]
    }
    \`\`\`
4.  **Content:** The 'title' for each node should be concise and clear. Keep the hierarchy to a maximum of two levels deep for clarity on the canvas.`;

    // Fix: Removed responseMimeType and responseSchema from the config. These properties are
    // incompatible with the `googleSearch` tool and were the direct cause of the API error.
    const response = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
        }
    }));
    
    try {
        // Fix: Added robust parsing to extract the JSON object from the model's raw text response.
        // This is necessary because without responseMimeType, the model might include markdown fences or other text.
        let jsonStr = response.text;
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        const parsedJson = JSON.parse(jsonStr);
        // Basic validation
        if (parsedJson && parsedJson.children && Array.isArray(parsedJson.children)) {
            return parsedJson as CanvasAIResponseNode;
        }
        throw new Error("AI response was not in the expected JSON format.");
    } catch (e) {
        console.error("Failed to parse canvas AI response:", response.text, e);
        // Fallback for parsing failure
        return {
            title: "Error",
            children: [{ title: "Failed to process the AI's response. Please try again." }]
        };
    }
};

export const generateCodeCompletion = async (code: string): Promise<string> => {
    const modelName = 'gemini-2.5-flash';
    const prompt = `You are an expert code completion AI. Your task is to complete the given code snippet.
- Only output the code that should be ADDED.
- Do NOT repeat the user's existing code.
- Do NOT include any explanations, comments, or markdown formatting.

---
EXAMPLE 1
User's code:
\`\`\`javascript
function greet(name) {
  console.l
\`\`\`
Your completion:
\`\`\`
og('Hello, ' + name);
}
\`\`\`
---
EXAMPLE 2
User's code:
\`\`\`css
.btn {
  padding: 10px;
  border-ra
\`\`\`
Your completion:
\`\`\`
dius: 5px;
}
\`\`\`
---
EXAMPLE 3
User's code:
\`\`\`jsx
import React from 'react';

function MyComponent() {
  return (
    <div className="co
\`\`\`
Your completion:
\`\`\`
ntainer">
      <h1>Hello</h1>
    </div>
  );
}
\`\`\`
---

Here is the actual request. Complete the following code:
User's code:
\`\`\`
${code}
\`\`\`
Your completion:
\`\`\`
`;

    const response = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            temperature: 0.1, // Lower temperature for more predictable completions
            stopSequences: ["```"] // Stop generation at the end of the code block
        }
    }));

    // The model might return the completion starting on a new line. We can trim that.
    return (response.text || '').trimStart();
};

export const analyzeProjectFiles = async (
  projectFiles: ProjectFiles
): Promise<AsyncIterable<GenerateContentResponse>> => {
    // Combine all files into a single string for the prompt
    const formattedFiles = projectFiles
        .map(file => `\`\`\`${file.path}\n${file.content}\n\`\`\``)
        .join('\n\n');

    const prompt = `As an AVO Pro expert code reviewer, analyze the following project files.
Provide a detailed report in markdown format that covers these key areas:
1.  **Code Quality & Best Practices:** Assess readability, structure, and adherence to modern standards.
2.  **Performance & Optimization:** Identify potential bottlenecks and suggest specific improvements for speed and efficiency.
3.  **Security Vulnerabilities:** Point out any common security risks (like XSS, dependency issues) and recommend how to fix them.

---
**PROJECT FILES:**
${formattedFiles}
`;

    return withRetry<AsyncIterable<GenerateContentResponse>>(() => getAi().models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }));
};

export const detectActionableTask = async (prompt: string): Promise<{ title: string } | null> => {
    const systemInstruction = `Analyze the user's text. If it contains an actionable command, to-do item, task, or reminder, set 'isTask' to true and extract a concise title for the task (less than 10 words). The title should be a clear action, like "Call John tomorrow" or "Finish the report". Otherwise, set 'isTask' to false and the title to an empty string. Respond only with the JSON object.`;

    try {
        const response = await withRetry<GenerateContentResponse>(() => getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isTask: { type: Type.BOOLEAN },
                        title: { type: Type.STRING },
                    },
                },
                thinkingConfig: { thinkingBudget: 0 } // Fast check
            },
        }));

        const result = JSON.parse(response.text);
        if (result.isTask && result.title) {
            return { title: result.title };
        }
        return null;
    } catch (error) {
        console.error("Failed to detect task from text:", error);
        return null;
    }
};