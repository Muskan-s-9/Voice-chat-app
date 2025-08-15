import express from "express";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import dotenv from "dotenv";
import pkg from 'wavefile';
import path from "path";
import { fileURLToPath } from 'url';
import cors from 'cors';

const { WaveFile } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const server = app.listen(PORT, () => {
    console.log(`🚀 Enhanced Revolt Motors Voice Chat Server running on http://localhost:${PORT}`);
});

// WebSocket server to bridge browser <-> Gemini Live
const wss = new WebSocketServer({ server });

// Enhanced Conversation state management with affective tracking
class ConversationManager {
    constructor() {
        this.conversations = new Map();
    }
    
    createSession(sessionId) {
        const session = {
            id: sessionId,
            context: [],
            currentLanguage: 'en',
            isInterrupted: false,
            interruptionCount: 0, // Track interruption frequency
            lastActivity: Date.now(),
            userProfile: {
                preferredLanguage: 'en',
                conversationStyle: 'casual'
            },
            // New affective dialog features
            emotionalContext: {
                currentMood: 'neutral',
                interactionStyle: 'professional_friendly',
                energyLevel: 'moderate'
            },
            audioStreamState: {
                isStreaming: false,
                streamStartTime: null,
                lastChunkTime: null,
                silenceThreshold: 1500, // Increased for more stability
                isProactiveMode: true
            },
            responseQueue: [],
            turnState: {
                isWaitingForResponse: false,
                currentTurnId: null,
                lastTurnTimestamp: 0
            }
        };
        this.conversations.set(sessionId, session);
        return session;
    }
    
    updateContext(sessionId, userInput, aiResponse, emotionalMetadata = null) {
        const session = this.conversations.get(sessionId);
        if (session) {
            const contextEntry = {
                timestamp: Date.now(),
                user: userInput,
                assistant: aiResponse
            };
            
            // Add emotional metadata if available
            if (emotionalMetadata) {
                contextEntry.emotion = emotionalMetadata;
                session.emotionalContext.currentMood = emotionalMetadata.detectedMood || 'neutral';
            }
            
            session.context.push(contextEntry);
            
            // Keep only last 15 exchanges for richer context
            if (session.context.length > 15) {
                session.context = session.context.slice(-15);
            }
            session.lastActivity = Date.now();
        }
    }
    
    handleInterruption(sessionId, interruptionType = 'user') {
        const session = this.conversations.get(sessionId);
        if (session) {
            // Prevent interruption spam with cooldown
            const now = Date.now();
            if (now - session.turnState.lastTurnTimestamp < 500) {
                console.log(`Interruption ignored - too frequent for session ${sessionId}`);
                return false;
            }
            
            session.interruptionCount++;
            session.isInterrupted = true;
            session.turnState.isWaitingForResponse = false;
            session.turnState.lastTurnTimestamp = now;
            
            // Clear response queue on interruption
            session.responseQueue = [];
            
            // Update emotional context for interruption handling
            if (interruptionType === 'urgent') {
                session.emotionalContext.energyLevel = 'high';
                session.emotionalContext.interactionStyle = 'responsive_immediate';
            }
            
            console.log(`Interruption handled for session ${sessionId} (count: ${session.interruptionCount})`);
            return true;
        }
        return false;
    }
    
    clearInterruption(sessionId) {
        const session = this.conversations.get(sessionId);
        if (session) {
            session.isInterrupted = false;
            session.emotionalContext.interactionStyle = 'professional_friendly';
            // Reset interruption count after successful completion
            if (session.interruptionCount > 0) {
                session.interruptionCount = Math.max(0, session.interruptionCount - 1);
            }
        }
    }
    
    updateAudioStreamState(sessionId, isStreaming, chunkReceived = false) {
        const session = this.conversations.get(sessionId);
        if (session) {
            session.audioStreamState.isStreaming = isStreaming;
            if (isStreaming && !session.audioStreamState.streamStartTime) {
                session.audioStreamState.streamStartTime = Date.now();
            }
            if (chunkReceived) {
                session.audioStreamState.lastChunkTime = Date.now();
            }
            if (!isStreaming) {
                session.audioStreamState.streamStartTime = null;
                session.audioStreamState.lastChunkTime = null;
            }
        }
    }
    
    setLanguage(sessionId, language) {
        const session = this.conversations.get(sessionId);
        if (session) {
            session.currentLanguage = language;
            session.userProfile.preferredLanguage = language;
        }
    }
    
    getSession(sessionId) {
        return this.conversations.get(sessionId);
    }
    
    deleteSession(sessionId) {
        this.conversations.delete(sessionId);
    }
}

const conversationManager = new ConversationManager();

// Enhanced system instructions with emotional intelligence
const getSystemInstruction = (language, context = [], emotionalContext = null) => {
    const baseInstruction = `You are Rev, Revolt Motors' voice assistant. Be warm, enthusiastic, and concise (max 2 short sentences). Adapt tone to user emotion: excited→match, confused→explain simply, frustrated→be empathetic. Know RV400, RV1, RV1+, battery swapping, subsidies, pricing from ₹85k, and service network. Highlight eco benefits, IoT, zero emissions. Remember context in session. Switch languages naturally.

Style Examples:
Q: "Price?" → "Starts at ₹85,000, plus subsidies make it even more affordable."
Q: "Range?" → "Up to 150 km per charge, or swap in 60 seconds."`;

    const languageInstructions = {
        'en': 'Respond in clear, natural English with appropriate emotional expression.',
        'hi': 'हिंदी में प्राकृतिक रूप से जवाब दें। भावनाओं को सही तरीके से व्यक्त करें। Technical terms के लिए English words का उपयोग करना ठीक है।',
    };

    let contextSummary = '';
    if (context.length > 0) {
        const recentContext = context.slice(-5);
        contextSummary = '\n\nRECENT CONVERSATION CONTEXT:\n' + 
            recentContext.map(c => {
                let entry = `User: ${c.user}\nAssistant: ${c.assistant}`;
                if (c.emotion) {
                    entry += `\nEmotional Context: ${c.emotion.detectedMood}`;
                }
                return entry;
            }).join('\n');
    }

    let emotionalInstructions = '';
    if (emotionalContext) {
        emotionalInstructions = `\n\nCURRENT EMOTIONAL CONTEXT:
- User Mood: ${emotionalContext.currentMood}
- Interaction Style: ${emotionalContext.interactionStyle}
- Energy Level: ${emotionalContext.energyLevel}
Adapt your response accordingly.`;
    }

    return baseInstruction + '\n\nLANGUAGE: ' + (languageInstructions[language] || languageInstructions['en']) + contextSummary + emotionalInstructions;
};

// Enhanced Gemini Live connection with improved interruption handling
wss.on("connection", async (browserWs) => {
    const sessionId = Math.random().toString(36).substring(7);
    console.log(`Browser connected - Session: ${sessionId}`);
    
    const session = conversationManager.createSession(sessionId);
    let geminiWs = null;
    let isStreamingActive = false;
    let modelOutput = [];
    let currentUserInput = '';
    let speechTimeout = null;
    let silenceTimeout = null;
    let lastAudioTime = Date.now();
    let isProcessingTurn = false; // Prevent concurrent turn processing

    // Message queue handler for better response management
    async function waitMessage(session, timeout = 5000) {
        let done = false;
        let message = undefined;
        const startTime = Date.now();
        
        while (!done && (Date.now() - startTime) < timeout) {
            message = session.responseQueue.shift();
            if (message) {
                done = true;
            } else {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        return message;
    }

    async function handleTurn(session) {
        if (isProcessingTurn) {
            console.log(`Turn already being processed for session ${sessionId}`);
            return [];
        }
        
        isProcessingTurn = true;
        const turns = [];
        let done = false;
        session.turnState.isWaitingForResponse = true;
        
        try {
            while (!done && !session.isInterrupted) {
                const message = await waitMessage(session, 3000);
                if (!message) {
                    console.log(`Turn timeout for session ${sessionId}`);
                    break;
                }
                
                turns.push(message);
                
                if (message.serverContent) {
                    if (message.serverContent.turnComplete) {
                        done = true;
                        session.turnState.isWaitingForResponse = false;
                    }
                    
                    // Handle interruptions more carefully
                    if (message.serverContent.interrupted === true) {
                        console.log(`Turn interrupted - Session: ${sessionId}`);
                        if (conversationManager.handleInterruption(sessionId)) {
                            modelOutput = [];
                            browserWs.send(JSON.stringify({ 
                                type: "interruption", 
                                text: "I'm listening..." 
                            }));
                        }
                        done = true;
                    }
                }
            }
        } catch (error) {
            console.error(`Error in handleTurn (${sessionId}):`, error);
        } finally {
            isProcessingTurn = false;
        }
        
        return turns;
    }

    // Enhanced Gemini connection with improved error handling
    async function connectToGemini() {
        return new Promise((resolve, reject) => {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) return resolve(geminiWs);

            console.log(`Connecting to Enhanced Gemini Live API for session ${sessionId}...`);
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
            geminiWs = new WebSocket(wsUrl);

            let setupComplete = false;

            geminiWs.on("open", () => {
                console.log(`Connected to Enhanced Gemini - Session: ${sessionId}`);
                
                try {
                    const currentSession = conversationManager.getSession(sessionId);
                    const systemInstruction = getSystemInstruction(
                        currentSession?.currentLanguage || 'en', 
                        currentSession?.context || [],
                        currentSession?.emotionalContext
                    );

                    // Optimized setup for stability
                    geminiWs.send(JSON.stringify({
                        setup: {
                            model: "models/gemini-2.5-flash-preview-native-audio-dialog",
                            generationConfig: {
                                responseModalities: ["AUDIO"],
                                temperature: 0.7,
                                topP: 0.8,
                                // maxOutputTokens: 200, // Slightly increased for complete responses
                                speechConfig: { 
                                    voiceConfig: { 
                                        prebuiltVoiceConfig: { 
                                            voiceName: "Aoede" 
                                        }
                                    }
                                }
                            },
                            systemInstruction: { 
                                parts: [{ text: systemInstruction + "\n\nIMPORTANT: Keep responses concise but complete (1-2 sentences max). Avoid interruptions unless user explicitly interrupts." }] 
                            }
                        }
                    }));
                    
                    resolve(geminiWs);
                } catch (error) {
                    console.error("Enhanced setup message error:", error);
                    reject(error);
                }
            });

            geminiWs.on("message", async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const currentSession = conversationManager.getSession(sessionId);

                    if (!currentSession) {
                        console.log(`Session ${sessionId} no longer exists, ignoring message`);
                        return;
                    }

                    // Add message to queue for processing
                    currentSession.responseQueue.push(msg);

                    if (msg.setupComplete && !setupComplete) {
                        setupComplete = true;
                        console.log(`🎯 Enhanced setup complete - Session: ${sessionId}`);
                        browserWs.send(JSON.stringify({ 
                            type: "status", 
                            text: "Enhanced AI assistant ready - speak naturally" 
                        }));
                    }

                    if (msg.serverContent) {
                        const { modelTurn, turnComplete, interrupted } = msg.serverContent;
                        let aiResponseText = '';
                        let emotionalMetadata = null;
                        
                        if (modelTurn?.parts) {
                            for (const part of modelTurn.parts) {
                                // Handle text responses with emotional context
                                if (part.text) {
                                    aiResponseText += part.text;
                                    console.log(`AI Response (${sessionId}):`, part.text);
                                    browserWs.send(JSON.stringify({
                                        type: "ai_response",
                                        text: part.text
                                    }));
                                }
                                
                                // Handle enhanced audio responses
                                if (part.inlineData?.mimeType?.includes("audio")) {
                                    modelOutput.push(Buffer.from(part.inlineData.data, "base64"));
                                }

                                // Extract emotional metadata if available
                                if (part.metadata && part.metadata.emotion) {
                                    emotionalMetadata = part.metadata.emotion;
                                }
                            }
                        }
                        
                        // Only handle legitimate interruptions
                        if (interrupted === true && !isProcessingTurn) {
                            console.log(`Legitimate interruption detected - Session: ${sessionId}`);
                            if (conversationManager.handleInterruption(sessionId)) {
                                modelOutput = [];
                                browserWs.send(JSON.stringify({ 
                                    type: "interruption", 
                                    text: "I'm listening..." 
                                }));
                            }
                        }
                        
                        if (turnComplete && !currentSession.isInterrupted) {
                            // Process complete turn
                            const turns = await handleTurn(currentSession);
                            
                            // Update conversation context with emotional metadata
                            if (currentUserInput || aiResponseText) {
                                conversationManager.updateContext(
                                    sessionId, 
                                    currentUserInput, 
                                    aiResponseText, 
                                    emotionalMetadata
                                );
                                currentUserInput = '';
                            }

                            // Send enhanced audio response
                            if (modelOutput.length > 0) {
                                try {
                                    const combined = Buffer.concat(modelOutput);
                                    const int16 = new Int16Array(combined.buffer, combined.byteOffset, combined.byteLength / 2);
                                    const wav = new WaveFile();
                                    wav.fromScratch(1, 24000, "16", int16);
                                    const wavB64 = Buffer.from(wav.toBuffer()).toString("base64");
                                    
                                    browserWs.send(JSON.stringify({ 
                                        type: "audio_response", 
                                        data: wavB64,
                                        emotionalContext: emotionalMetadata
                                    }));
                                } catch (audioError) {
                                    console.error(`Audio processing error (${sessionId}):`, audioError);
                                }
                            }
                            modelOutput = [];
                            
                            conversationManager.clearInterruption(sessionId);
                            
                            browserWs.send(JSON.stringify({ 
                                type: "status", 
                                text: "Listening..." 
                            }));
                        }
                    }

                } catch (err) {
                    console.error(`Enhanced Gemini parse error (${sessionId}):`, err);
                }
            });

            geminiWs.on("close", (code, reason) => {
                console.log(`Enhanced Gemini disconnected (${sessionId}) - Code: ${code}, Reason: ${reason}`);
                geminiWs = null;
                setupComplete = false;
                browserWs.send(JSON.stringify({ 
                    type: "status", 
                    text: "Disconnected from AI - Reconnecting..." 
                }));
                
                // Only reconnect if still active and not too many failures
                if (isStreamingActive && code !== 1000) {
                    setTimeout(() => {
                        connectToGemini().catch(console.error);
                    }, 2000);
                }
            });

            geminiWs.on("error", (err) => {
                console.error(`Enhanced Gemini error (${sessionId}):`, err);
                if (!setupComplete) {
                    reject(err);
                }
            });
        });
    }

    // Improved silence detection with better timing
    function startEnhancedSilenceDetection() {
        if (silenceTimeout) clearTimeout(silenceTimeout);
        
        const currentSession = conversationManager.getSession(sessionId);
        const silenceThreshold = currentSession?.audioStreamState.silenceThreshold || 1500;
        
        silenceTimeout = setTimeout(() => {
            if (Date.now() - lastAudioTime > silenceThreshold && isStreamingActive && !isProcessingTurn) {
                console.log(`Silence detected for session ${sessionId}, ending speech input`);
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: ""
                            }]
                        }
                    }));
                }
                
                conversationManager.updateAudioStreamState(sessionId, false);
            }
        }, 500);
    }

    browserWs.on("message", async (data, isBinary) => {
        if (!isBinary) {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === "start_conversation") {
                isStreamingActive = true;
                isProcessingTurn = false;
                try {
                    await connectToGemini();
                    conversationManager.updateAudioStreamState(sessionId, true);
                    browserWs.send(JSON.stringify({ 
                        type: "status", 
                        text: "Enhanced conversation started - speak naturally" 
                    }));
                } catch (error) {
                    console.error(`Failed to start enhanced conversation (${sessionId}):`, error);
                    browserWs.send(JSON.stringify({ 
                        type: "error", 
                        text: "Failed to connect to Enhanced AI" 
                    }));
                }
            }
            
            if (msg.type === "stop_conversation") {
                isStreamingActive = false;
                isProcessingTurn = false;
                conversationManager.updateAudioStreamState(sessionId, false);
                if (silenceTimeout) clearTimeout(silenceTimeout);
                if (speechTimeout) clearTimeout(speechTimeout);
                if (geminiWs) {
                    geminiWs.close(1000, "User stopped conversation");
                }
                browserWs.send(JSON.stringify({ 
                    type: "status", 
                    text: "Enhanced conversation stopped" 
                }));
            }

            // Enhanced language change handling
            if (msg.type === "language_change") {
                conversationManager.setLanguage(sessionId, msg.language);
                console.log(`Language changed to ${msg.language} for session ${sessionId}`);
                
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                    geminiWs.close();
                }
                
                if (isStreamingActive) {
                    setTimeout(async () => {
                        try {
                            await connectToGemini();
                            browserWs.send(JSON.stringify({ 
                                type: "status", 
                                text: `Language changed to ${msg.language}. Ready to chat...` 
                            }));
                        } catch (error) {
                            console.error(`Failed to reconnect after language change (${sessionId}):`, error);
                        }
                    }, 500);
                }
            }

            // Handle user-initiated interruptions more carefully
            if (msg.type === "user_interruption") {
                const session = conversationManager.getSession(sessionId);
                if (session && !isProcessingTurn) {
                    if (conversationManager.handleInterruption(sessionId, 'user')) {
                        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                            geminiWs.send(JSON.stringify({
                                realtimeInput: {
                                    mediaChunks: [{
                                        mimeType: "audio/pcm;rate=16000",
                                        data: ""
                                    }]
                                }
                            }));
                        }
                        browserWs.send(JSON.stringify({ 
                            type: "status", 
                            text: "I'm listening..." 
                        }));
                    }
                }
            }
            
            // Audio chunk handling with rate limiting
            if (msg.type === "audio_chunk" && isStreamingActive && !isProcessingTurn) {
                lastAudioTime = Date.now();
                conversationManager.updateAudioStreamState(sessionId, true, true);
                startEnhancedSilenceDetection();

                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                    const audioData = Buffer.from(msg.data, 'base64');
                    
                    try {
                        geminiWs.send(JSON.stringify({
                            realtimeInput: {
                                mediaChunks: [{
                                    mimeType: "audio/pcm;rate=16000",
                                    data: audioData.toString("base64")
                                }]
                            }
                        }));
                    } catch (error) {
                        console.error(`Error sending audio chunk (${sessionId}):`, error);
                    }
                }
            }

            // Enhanced text input for debugging/testing
            if (msg.type === "text_input") {
                currentUserInput = msg.text;
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN && !isProcessingTurn) {
                    geminiWs.send(JSON.stringify({
                        realtimeInput: {
                            textInput: { text: msg.text }
                        }
                    }));
                }
            }

            // Emotional context update from frontend
            if (msg.type === "emotion_update") {
                const session = conversationManager.getSession(sessionId);
                if (session && msg.emotionalData) {
                    session.emotionalContext = {
                        ...session.emotionalContext,
                        ...msg.emotionalData
                    };
                    console.log(`Emotional context updated for session ${sessionId}:`, msg.emotionalData);
                }
            }
        }
    });

    browserWs.on("close", () => {
        console.log(`Browser disconnected - Session: ${sessionId}`);
        isStreamingActive = false;
        isProcessingTurn = false;
        conversationManager.updateAudioStreamState(sessionId, false);
        if (silenceTimeout) clearTimeout(silenceTimeout);
        if (speechTimeout) clearTimeout(speechTimeout);
        if (geminiWs) {
            geminiWs.close(1000, "Browser disconnected");
        }
        conversationManager.deleteSession(sessionId);
    });

    // Initialize connection with enhanced features
    browserWs.send(JSON.stringify({ 
        type: "status", 
        text: "Connected to Enhanced AI - click Start for conversation",
        sessionId: sessionId,
        features: {
            affectiveDialog: true,
            proactiveAudio: true,
            emotionalIntelligence: true,
            enhancedInterruption: true
        }
    }));
});

// Enhanced health check with interruption stats
app.get('/health', (req, res) => {
    const activeConversations = conversationManager.conversations.size;
    const sessions = Array.from(conversationManager.conversations.values());
    const emotionalStats = sessions.reduce((acc, session) => {
        acc[session.emotionalContext.currentMood] = (acc[session.emotionalContext.currentMood] || 0) + 1;
        return acc;
    }, {});

    const interruptionStats = sessions.reduce((acc, session) => {
        acc.total += session.interruptionCount;
        if (session.interruptionCount > acc.max) acc.max = session.interruptionCount;
        return acc;
    }, { total: 0, max: 0 });

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeConversations,
        emotionalDistribution: emotionalStats,
        interruptionStats,
        features: {
            multiLanguage: true,
            contextAware: true,
            interruptionHandling: true,
            lowLatency: true,
            affectiveDialog: true,
            proactiveAudio: true,
            emotionalIntelligence: true,
            enhancedAudioProcessing: true
        },
        apiVersion: 'current',
        geminiModel: 'gemini-2.5-flash-preview-native-audio-dialog'
    });
});

// Enhanced API endpoint with interruption data
app.get('/api/conversations/:sessionId', (req, res) => {
    const session = conversationManager.getSession(req.params.sessionId);
    if (session) {
        res.json({
            sessionId: session.id,
            language: session.currentLanguage,
            contextLength: session.context.length,
            lastActivity: new Date(session.lastActivity).toISOString(),
            emotionalContext: session.emotionalContext,
            audioStreamState: session.audioStreamState,
            turnState: session.turnState,
            interruptionCount: session.interruptionCount,
            features: {
                affectiveDialog: true,
                proactiveAudio: session.audioStreamState.isProactiveMode
            }
        });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Enhanced analytics endpoint with interruption data
app.get('/api/analytics/emotions', (req, res) => {
    const sessions = Array.from(conversationManager.conversations.values());
    const analytics = {
        totalSessions: sessions.length,
        emotionalDistribution: sessions.reduce((acc, session) => {
            acc[session.emotionalContext.currentMood] = (acc[session.emotionalContext.currentMood] || 0) + 1;
            return acc;
        }, {}),
        interactionStyles: sessions.reduce((acc, session) => {
            acc[session.emotionalContext.interactionStyle] = (acc[session.emotionalContext.interactionStyle] || 0) + 1;
            return acc;
        }, {}),
        averageContextLength: sessions.reduce((sum, s) => sum + s.context.length, 0) / sessions.length || 0,
        activeStreamingSessions: sessions.filter(s => s.audioStreamState.isStreaming).length,
        interruptionAnalytics: {
            totalInterruptions: sessions.reduce((sum, s) => sum + s.interruptionCount, 0),
            averagePerSession: sessions.reduce((sum, s) => sum + s.interruptionCount, 0) / sessions.length || 0,
            highInterruptionSessions: sessions.filter(s => s.interruptionCount > 5).length
        }
    };
    
    res.json(analytics);
});


export default app;