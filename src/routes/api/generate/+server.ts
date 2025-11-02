import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  console.log('[API /api/generate] Received request');
  try {
    const { settings, fullPrompt } = await request.json();

    if (!settings.apiKey) {
      console.error('[API /api/generate] Error: API key not set.');
      return json({ error: 'OpenRouter API key is not set in settings.' }, { status: 400 });
    }
    if (!settings.selectedModel) {
      console.error('[API /api/generate] Error: Model not selected.');
      return json({ error: 'No LLM model selected in settings.' }, { status: 400 });
    }
    if (!fullPrompt) {
      console.error('[API /api/generate] Error: No prompt provided.');
      return json({ error: 'No prompt was provided to the API.' }, { status: 400 });
    }

    console.log(`[API /api/generate] Sending request to OpenRouter endpoint: ${settings.apiEndpoint}/chat/completions`);
    const response = await fetch(`${settings.apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
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