import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  console.log('[API /api/generate] Received request');
  try {
    const { settings, fullPrompt } = await request.json();

    // API key is OPTIONAL now: a local server (LM Studio / Ollama at e.g. http://localhost:1234/v1)
    // needs none. Only hosted providers (OpenRouter) require one — we just forward whatever's set.
    if (!settings.selectedModel) {
      console.error('[API /api/generate] Error: Model not selected.');
      return json({ error: 'No LLM model selected in settings.' }, { status: 400 });
    }
    if (!fullPrompt) {
      console.error('[API /api/generate] Error: No prompt provided.');
      return json({ error: 'No prompt was provided to the API.' }, { status: 400 });
    }

    const endpoint = (settings.apiEndpoint || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`;

    console.log(`[API /api/generate] Sending request to endpoint: ${endpoint}/chat/completions`);
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.selectedModel,
        messages: [{ role: 'user', content: fullPrompt }],
        stream: true
      })
    });

    console.log(`[API /api/generate] Received response from OpenRouter with status: ${response.status}`);

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[API /api/generate] OpenRouter error: ${response.statusText}`, errorBody);
        return json({ error: `OpenRouter API Error: ${response.statusText}`, details: errorBody }, { status: response.status });
    }

    // Create a new ReadableStream to intercept and log the data from OpenRouter
    const readable = new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          // console.log('[API /api/generate] Stream chunk received:', chunk); // Optional: for debugging stream
          controller.enqueue(value);
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream'
      }
    });

  } catch (e: any) {
    console.error('[API /api/generate] An unexpected error occurred:', e);
    return json({ error: 'An unexpected server error occurred.', details: e.message }, { status: 500 });
  }
};