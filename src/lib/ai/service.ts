import { get } from 'svelte/store';
import { aiSettings, systemStore } from '../stores';
import type { CelestialBody, System } from '../types';

export async function* generateDescription(
  body: CelestialBody,
  seedText: string,
  tags: string[],
  style: { label: string; guideline: string },
): AsyncGenerator<string, void, unknown> {

  const settings = get(aiSettings);
  const system = get(systemStore);

  if (!settings.apiKey) {
    throw new Error("OpenRouter API key is not set in settings.");
  }
  if (!settings.selectedModel) {
    throw new Error("No LLM model selected in settings.");
  }
  if (!system) {
    throw new Error("System not found.");
  }

  // Find the host star
  const hostStar = system.nodes.find(n => n.id === body.orbit?.hostId);

  // 1. Construct the prompt
  const prompt = `
    System Information:
    - Star: ${JSON.stringify(hostStar, null, 2)}
    - Planet: ${JSON.stringify(body, null, 2)}

    GM's Seed Text: "${seedText}"

    Desired Tags: ${tags.join(', ')}

    Report Style: ${style.label}
    Style Guideline: ${style.guideline}

    Based on all the information above, please generate a narrative description for the planet.
  `;

  // 2. Make the API call
  const response = await fetch(settings.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.selectedModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  });

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  // 3. Handle the stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    // SSE format: data: { ... } 
    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
    for (const line of lines) {
      const jsonStr = line.replace('data: ', '');
      if (jsonStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch (e) {
        console.error("Failed to parse stream chunk:", e);
      }
    }
  }
}
