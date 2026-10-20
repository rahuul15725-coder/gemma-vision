require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, image, mimeType } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured. Please add it to your .env file.' });
    }

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemma-3-27b-it' });

    // Build history (all but last message)
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role,
      parts: msg.parts || [{ text: msg.content || '' }]
    }));

    // Build the current user content parts
    const lastMessage = messages[messages.length - 1];
    const parts = [];

    if (image && mimeType) {
      parts.push({
        inlineData: {
          data: image,
          mimeType: mimeType
        }
      });
    }

    const textContent = lastMessage.parts ? lastMessage.parts[0].text : (lastMessage.content || '');
    if (textContent) {
      parts.push({ text: textContent });
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'No content in message' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(parts);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('API Error:', error);
    const errMsg = error.message || 'An error occurred';
    if (!res.headersSent) {
      res.status(500).json({ error: errMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Gemma Vision Assistant running at http://localhost:${PORT}`);
  console.log(`📖 Open your browser and go to http://localhost:${PORT}\n`);
});
