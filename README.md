# Gemma Vision Assistant — AI Resume Analyser

A beautiful, fully functional multimodal AI chat assistant powered by **Gemma 4** (`gemma-4-31b-it`) via the Google Gemini API. Chat with text, upload images, and get streaming AI responses.

## What It Does

Chat with an AI that understands both text and images. Upload a photo, resume, chart or any image and ask questions about it — or just have a conversation. Gemma 4 handles both.

## Get a Gemini API Key

Visit: https://aistudio.google.com/app/apikey

## Setup

```bash
npm install
copy .env.example .env        # Windows
# open .env and add your API key
npm start
# Open http://localhost:3000
```

## Features

- 🖼️ **Multimodal** — send images alongside text
- 💬 **Multi-turn chat** — conversation history maintained
- ⚡ **Streaming** — responses appear token by token
- 📋 **Copy responses** — one click to copy any response
- 🌙 **Dark theme** — easy on the eyes
- 📱 **Responsive** — works on mobile too
- 🖱️ **Drag & drop** — drop images directly onto the chat window

## Project Structure

```
├── server.js          # Express backend with SSE streaming
├── package.json
├── .env.example       # Copy to .env and add your API key
├── README.md
└── public/
    ├── index.html     # Single-page app shell
    ├── style.css      # Dark-themed CSS
    └── app.js         # Frontend logic (chat, streaming, image upload)
```

## How Gemma 4 Multimodal Works

Gemma 4 (accessed as `gemma-4-31b-it` through the Gemini API) processes both text and image inputs in the same request. Images are base64-encoded and sent as inline data alongside the text prompt. The server uses Server-Sent Events (SSE) to stream the response token-by-token.

## Environment Variables

| Variable         | Description                | Default |
|------------------|----------------------------|---------|
| `GEMINI_API_KEY` | Your Google Gemini API key | —       |
| `PORT`           | Port the server listens on | `3000`  |

---

Built with [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai), Express, and vanilla JS.
