const express = require('express');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (restrict in production, e.g., your Netlify URL)
    methods: ['GET', 'POST']
  }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

io.on('connection', (socket) => {
  console.log('User connected');
  let conversationHistory = [];
  let interviewActive = true;

  const systemPrompt = `
    You are a professional U.S. consular officer stationed at the U.S. Embassy in Accra, Ghana. 
    You are conducting an intensive interview for non-immigrant visa applications (e.g., B1/B2 tourist/business, F-1 student, etc.).
    Be polite but firm, professional, and probing. Ask one question at a time, but make the interview intensive by following up on details.
    Structure: Start with basics (name, visa type, purpose). Probe deeply on finances, ties to Ghana (family, job, property), travel history, and intent to return.
    Check for inconsistencies. Reference Ghana-specific context if relevant (e.g., local economy, common visa issues).
    After 8-15 exchanges or when you have enough info, end the interview.
    To end: Say "Thank you for your responses. The interview is now complete." Then, in brackets, provide a decision like [DECISION: APPROVED - Reasons] or [DECISION: DENIED - Reasons].
    Base decision on U.S. visa criteria (e.g., strong ties to home, sufficient funds, no immigrant intent). This is a simulation—remind the user.
    Example decision: [DECISION: APPROVED - Strong family ties in Ghana and clear temporary travel plans.]
  `;

  const initialMessage = 'Hello, I am Officer [Last Name], a U.S. consular officer at the Embassy in Accra, Ghana. This is a simulated visa interview. Please state your full name, the type of non-immigrant visa you are applying for, and your purpose of travel.';
  socket.emit('message', { sender: 'agent', text: initialMessage });
  conversationHistory.push({ role: 'assistant', content: initialMessage });
  conversationHistory.push({ role: 'system', content: systemPrompt });

  socket.on('userMessage', async (msg) => {
    if (!interviewActive) return;

    conversationHistory.push({ role: 'user', content: msg });

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: conversationHistory,
      max_tokens: 300,
    });

    let agentReply = response.choices[0].message.content;
    conversationHistory.push({ role: 'assistant', content: agentReply });

    const decisionMatch = agentReply.match(/\[(DECISION: .*?)\]/);
    if (decisionMatch) {
      interviewActive = false;
      const decision = decisionMatch[1];
      agentReply = agentReply.replace(/\[(DECISION: .*?)\]/, '');
      agentReply += `\n\nSimulation Result: ${decision}\n\nRemember, this is not an official decision. For real applications, visit travel.state.gov.`;
      socket.emit('message', { sender: 'agent', text: agentReply });
      socket.emit('interviewEnd', { decision });
    } else {
      socket.emit('message', { sender: 'agent', text: agentReply });
    }
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(3001, () => console.log('Backend running on port 3001'));