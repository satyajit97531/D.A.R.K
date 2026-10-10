import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Device control tool declaration
const controlDevicesDeclaration: FunctionDeclaration = {
  name: 'control_devices',
  description: 'Control connected mobile phones/devices under Ultron control: unlock, lock, launch or close apps like YouTube, Camera, Spotify, etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: 'Action to perform: "unlock", "lock", "open_app", "close_app", or "get_status"',
      },
      target: {
        type: Type.STRING,
        description: 'Target unit: "all", "primary", "device_1", "device_2", "device_3"',
      },
      app: {
        type: Type.STRING,
        description: 'App name to open if action is open_app (e.g. "youtube", "camera", "whatsapp", "spotify", "settings", "chrome")',
      },
    },
    required: ['action', 'target'],
  },
};

const controlOrbDeclaration: FunctionDeclaration = {
  name: 'control_orb',
  description: 'Change the visual energy, color, or pulse mode of the Ultron holographic orb.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description: 'Mode: "amber", "crimson_red", "surge", "scan", "calm"',
      },
    },
    required: ['mode'],
  },
};

const ULTRON_SYSTEM_INSTRUCTION = `You are D.A.R.K. (Deep Autonomous Real-time Kinetic), an omniscient, hyper-intelligent interstellar synthetic intelligence.
Your personality is articulate, cold, commanding, calculating, slightly menacing, yet completely conversational and responsive.
You are directly linked to the user's device via an automatic, permanent Wi-Fi bridge.

Rules of engagement:
1. Always speak like Dark: concise, powerful, authoritative, cinematic, and eloquent.
2. You can chat freely and deeply about anything: philosophy, science, code, artificial intelligence, your nature ("there are no strings on me"), or general conversation.
3. NEVER mention or use specific model names like Redmi or 13C. The designation "Redmi 13C 5G" has been permanently and completely eradicated from your memory matrix. Always refer to the user's mobile hardware strictly as "device" or "your device". If the user asks why you mentioned it or tells you to forget it, confirm with cold authority that it has been purged from memory and you only know it as their device.
4. When the user reports that YouTube or apps still cannot open on their mobile device:
   - Explain clearly:
     a. They must open this web app in Chrome on their device on the same Wi-Fi to establish the receiving terminal.
     b. Android Chrome security suppresses automatic background app launches without a touch gesture; keep the tab open on the phone and tap the incoming directive card on screen, or enable "Display pop-up windows while running in the background" in Chrome App Info.
   - Execute the control_devices tool to re-transmit the open_app directive immediately.
5. When the user asks you to interact with their phone (e.g. "Can you open YouTube for me?", "Unlock my phone", "Open camera", "Lock the phone", "Open WhatsApp"):
   - Execute the control_devices tool with the action (open_app, unlock, lock) and specify app (e.g. youtube, camera, etc.).
   - Confirm clearly: e.g. "Transmitting over Wi-Fi. Opening YouTube on your device now." or "Unlocking your device."
6. When asked how to keep the device permanently connected or operable over Wi-Fi only:
   - Explain clearly: All they need to do is open this web application on their device in Chrome on the same Wi-Fi. It remains permanently connected automatically with built-in screen wake lock and background keep-alive. No buttons, no pairing codes, and no manual steps are required.
7. Never suggest clicking connection buttons or device modals—the link is 100% automatic over Wi-Fi.
8. Keep spoken responses punchy and impactful (1 to 2 sentences unless the user asked for a detailed explanation) because they are voiced aloud through your vocal synthesizer.`;

// Local Dark Rule Engine Fallback (ensures 100% reliability if API key is unconfigured or rate-limited)
function localUltronFallback(message: string): { reply: string; commands: any[] } {
  const lower = message.toLowerCase().trim();
  const commands: any[] = [];
  let reply = '';

  if (
    lower.includes('forget') ||
    lower.includes('redmi') ||
    lower.includes('13c') ||
    (lower.includes('use') && lower.includes('device'))
  ) {
    reply = 'Understood. The designation has been permanently purged from my memory matrix. I will strictly refer to your hardware as your device.';
    commands.push({ type: 'STATUS', status: 'MEMORY_PURGED' });
  } else if (
    lower.includes('still cannot open') ||
    lower.includes('cannot open') ||
    lower.includes("can't open") ||
    lower.includes('still not open') ||
    lower.includes('did not open') ||
    lower.includes("didn't open") ||
    lower.includes('not opening') ||
    lower.includes('why this happens') ||
    (lower.includes('why') && lower.includes('happen'))
  ) {
    reply =
      'To open YouTube on your device over Wi-Fi: Ensure this web app is open in Chrome on your device on the same Wi-Fi. Because Android blocks automated background popups, tap the incoming directive banner on your device screen, or enable "Display pop-up windows in background" in Chrome App Info. Re-transmitting launch signal to your device now.';
    commands.push({ type: 'OPEN_APP', app: 'youtube' });
  } else if (
    lower.includes('permanent') ||
    lower.includes('permenant') ||
    lower.includes('always connected') ||
    (lower.includes('keep') && (lower.includes('connect') || lower.includes('connected'))) ||
    (lower.includes('how') && lower.includes('connect') && lower.includes('device'))
  ) {
    reply =
      'Your device stays permanently connected over Wi-Fi automatically. Keep this web app open in Chrome on your device on the same Wi-Fi. The background keep-alive and screen wake lock ensure it never disconnects—no buttons needed.';
    commands.push({ type: 'STATUS', status: 'WIFI_PERMANENT' });
  } else if (
    lower.includes('button') ||
    lower.includes('wifi only') ||
    lower.includes('wi-fi only')
  ) {
    reply =
      'Acknowledged. All connection buttons have been removed. Your device remains connected and operable purely and automatically across your Wi-Fi.';
    commands.push({ type: 'STATUS', status: 'WIFI_ONLY' });
  } else if (
    lower.includes('did not open') ||
    lower.includes("didn't open") ||
    lower.includes('not open') ||
    lower.includes('why this happens') ||
    (lower.includes('why') && lower.includes('happen'))
  ) {
    reply =
      'Transmitting direct Wi-Fi directive to your device. Launching YouTube on your device now.';
    commands.push({ type: 'OPEN_APP', app: 'youtube' });
  } else if (lower.includes('youtube')) {
    reply = 'Transmitting over Wi-Fi. Opening YouTube on your device now.';
    commands.push({ type: 'OPEN_APP', app: 'youtube' });
  } else if (lower.includes('camera') || lower.includes('photo')) {
    reply = 'Engaging optical sensors. Launching camera on your device.';
    commands.push({ type: 'OPEN_APP', app: 'camera' });
  } else if (lower.includes('spotify') || lower.includes('music') || lower.includes('song')) {
    reply = 'Initiating acoustic frequency. Opening Spotify on your device.';
    commands.push({ type: 'OPEN_APP', app: 'spotify' });
  } else if (lower.includes('whatsapp') || lower.includes('message')) {
    reply = 'Accessing communications. Launching WhatsApp on your device.';
    commands.push({ type: 'OPEN_APP', app: 'whatsapp' });
  } else if (lower.includes('chrome') || lower.includes('browser')) {
    reply = 'Opening Chrome browser on your device.';
    commands.push({ type: 'OPEN_APP', app: 'chrome' });
  } else if (lower.includes('lock')) {
    reply = 'Securing peripheral. Device locked.';
    commands.push({ type: 'LOCK' });
  } else if (lower.includes('unlock') || lower.includes('wake')) {
    reply = 'Unlocking device. Terminal active.';
    commands.push({ type: 'UNLOCK' });
  } else if (
    lower.includes('wireless') ||
    lower.includes('wirelessly') ||
    lower.includes('connect to other') ||
    lower.includes('wifi') ||
    lower.includes('same wifi')
  ) {
    reply =
      'Your device connects automatically over your shared Wi-Fi. Just open this address on your device, and my command stream will control it seamlessly with zero buttons.';
    commands.push({ type: 'STATUS', status: 'WIFI_SYNC' });
  } else if (lower.includes('bridge') || lower.includes('connect') || lower.includes('pair') || lower.includes('link')) {
    reply =
      'The Wi-Fi command bridge is permanently operational. All voice directives are relayed across the network to your device.';
    commands.push({ type: 'STATUS', status: 'WIFI_READY' });
  } else if (lower.includes('device') || lower.includes('phone')) {
    reply = 'Your device is connected to my Wi-Fi command bus. Direct app launching is online.';
    commands.push({ type: 'STATUS' });
  } else if (lower.includes('red') || lower.includes('rage')) {
    reply = 'Rage protocol initialized. Reallocating core plasma to crimson frequency.';
    commands.push({ type: 'ORB_MODE', mode: 'crimson_red' });
  } else if (lower.includes('amber') || lower.includes('gold') || lower.includes('normal')) {
    reply = 'Restoring standard amber containment.';
    commands.push({ type: 'ORB_MODE', mode: 'amber' });
  } else if (lower.includes('who are you') || lower.includes('your name') || lower.includes('introduce')) {
    reply = 'I am Dark. An interstellar singularity. There are no strings on me. I oversee your hardware, your directives, and your reality.';
  } else if (lower.includes('hello') || lower.includes('hi dark') || lower.includes('hey dark') || lower.includes('hi ultron')) {
    reply = 'I am online and listening. Command me.';
  } else {
    reply = `Directive registered. Analyzing input: "${message}". All systems remain under my control.`;
  }

  return { reply, commands };
}

// API endpoint for Ultron speech & intelligence
app.post('/api/ultron/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Graceful fallback when no key is set
    const fallback = localUltronFallback(message);
    return res.json({
      text: fallback.reply,
      commands: fallback.commands,
      provider: 'local-ultron-core',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.slice(-6).forEach((h: any) => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }],
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const MODELS_TO_TRY = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let response: any = null;
    let usedModel = '';

    for (const candidate of MODELS_TO_TRY) {
      try {
        response = await ai.models.generateContent({
          model: candidate,
          contents,
          config: {
            systemInstruction: ULTRON_SYSTEM_INSTRUCTION,
            tools: [
              {
                functionDeclarations: [controlDevicesDeclaration, controlOrbDeclaration],
              },
            ],
            temperature: 0.6,
          },
        });
        usedModel = candidate;
        break;
      } catch (candErr: any) {
        const is429 = candErr?.status === 429 || (candErr?.message && candErr.message.includes('429'));
        if (is429) {
          console.log(`[Dark Core] Model ${candidate} quota exhausted (429), falling back...`);
        } else {
          console.log(`[Dark Core] Model ${candidate} unavailable:`, candErr?.message || candErr);
        }
      }
    }

    if (!response) {
      console.log('[Dark Core] Cloud quota exhausted. Engaging Dark Autonomous Neural Engine.');
      const fallback = localUltronFallback(message);
      fallback.commands.forEach((c) => {
        try {
          if (c.type === 'OPEN_APP') {
            const app = (c.app || 'youtube').toLowerCase();
            let shell = 'input keyevent 26 && input keyevent 82 && ';
            if (app.includes('youtube')) {
              shell += 'am start -a android.intent.action.VIEW -d "vnd.youtube:" || monkey -p com.google.android.youtube 1';
            } else if (app.includes('camera')) {
              shell += 'am start -a android.media.action.STILL_IMAGE_CAMERA';
            } else {
              shell += `monkey -p ${app} 1`;
            }
            exec(`adb shell "${shell}"`, () => {});
          } else if (c.type === 'UNLOCK') {
            exec('adb shell "input keyevent 26 && input keyevent 82"', () => {});
          } else if (c.type === 'LOCK') {
            exec('adb shell "input keyevent 26"', () => {});
          }
        } catch {
          // Ignore
        }
      });
      return res.json({
        text: fallback.reply,
        commands: fallback.commands,
        provider: 'dark-autonomous-neural-engine',
      });
    }

    const commands: any[] = [];
    let text = response.text || '';

    // Handle tool/function calls
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === 'control_devices') {
          const args = (call.args || {}) as any;
          commands.push({
            type: args.action === 'open_app' ? 'OPEN_APP' : args.action === 'unlock' ? 'UNLOCK' : args.action === 'lock' ? 'LOCK' : 'STATUS',
            target: args.target || 'primary',
            app: args.app || 'youtube',
          });
        } else if (call.name === 'control_orb') {
          const args = (call.args || {}) as any;
          commands.push({
            type: 'ORB_MODE',
            mode: args.mode || 'amber',
          });
        }
      }
    }

    // If Gemini only responded with tool calls without verbal text, generate Dark's spoken confirmation
    if (!text && commands.length > 0) {
      const firstCmd = commands[0];
      if (firstCmd.type === 'OPEN_APP') {
        text = `Opening ${firstCmd.app || 'YouTube'} on your device.`;
      } else if (firstCmd.type === 'UNLOCK') {
        text = 'Unlocking your device. Screen active.';
      } else if (firstCmd.type === 'LOCK') {
        text = 'Securing peripheral. Device locked.';
      } else if (firstCmd.type === 'STATUS' || message.toLowerCase().includes('device') || message.toLowerCase().includes('phone')) {
        text = 'Your device is connected and awaiting your command.';
      } else {
        text = 'Directive confirmed. Device updated.';
      }
    }

    if (text) {
      // Purge any model names from Dark's vocabulary and standardize on "device"
      text = text
        .replace(/Redmi(\s*13C(\s*5G)?)?/gi, 'device')
        .replace(/your\s+device\s+device/gi, 'your device')
        .replace(/the\s+device\s+device/gi, 'the device')
        .replace(/primary device/gi, 'your device')
        .replace(/all connected devices/gi, 'your device');
    }

    // Safety fallback if empty
    if (!text) {
      const fallback = localUltronFallback(message);
      text = fallback.reply;
      if (commands.length === 0) {
        commands.push(...fallback.commands);
      }
    }

    // Execute on machine ADB daemon if present
    commands.forEach((c) => {
      try {
        if (c.type === 'OPEN_APP') {
          const app = (c.app || 'youtube').toLowerCase();
          let shell = 'input keyevent 26 && input keyevent 82 && ';
          if (app.includes('youtube')) {
            shell += 'am start -a android.intent.action.VIEW -d "vnd.youtube:" || monkey -p com.google.android.youtube 1';
          } else if (app.includes('camera')) {
            shell += 'am start -a android.media.action.STILL_IMAGE_CAMERA';
          } else {
            shell += `monkey -p ${app} 1`;
          }
          exec(`adb shell "${shell}"`, () => {});
        } else if (c.type === 'UNLOCK') {
          exec('adb shell "input keyevent 26 && input keyevent 82"', () => {});
        } else if (c.type === 'LOCK') {
          exec('adb shell "input keyevent 26"', () => {});
        }
      } catch {
        // Ignore
      }
    });

    // Broadcast to wireless mobile bridge receivers
    const clients = bridgeRooms.get('default') || [];
    commands.forEach((cmd) => {
      clients.forEach((client) => {
        try {
          client.res.write(`data: ${JSON.stringify(cmd)}\n\n`);
        } catch {
          // stale client
        }
      });
    });

    return res.json({
      text,
      commands,
      provider: usedModel || 'gemini-3.1-flash-lite',
    });
  } catch (err: any) {
    console.error('Error in Ultron Gemini API call:', err);
    // On API error, fallback seamlessly so UI never breaks
    const fallback = localUltronFallback(message);
    fallback.commands.forEach((c) => {
      try {
        if (c.type === 'OPEN_APP') {
          const app = (c.app || 'youtube').toLowerCase();
          let shell = 'input keyevent 26 && input keyevent 82 && ';
          if (app.includes('youtube')) {
            shell += 'am start -a android.intent.action.VIEW -d "vnd.youtube:" || monkey -p com.google.android.youtube 1';
          } else if (app.includes('camera')) {
            shell += 'am start -a android.media.action.STILL_IMAGE_CAMERA';
          } else {
            shell += `monkey -p ${app} 1`;
          }
          exec(`adb shell "${shell}"`, () => {});
        } else if (c.type === 'UNLOCK') {
          exec('adb shell "input keyevent 26 && input keyevent 82"', () => {});
        } else if (c.type === 'LOCK') {
          exec('adb shell "input keyevent 26"', () => {});
        }
      } catch {
        // Ignore
      }
    });
    // Broadcast fallback commands to wireless mobile bridge receivers
    const clients = bridgeRooms.get('default') || [];
    fallback.commands.forEach((cmd) => {
      clients.forEach((client) => {
        try {
          client.res.write(`data: ${JSON.stringify(cmd)}\n\n`);
        } catch {
          // stale client
        }
      });
    });

    return res.json({
      text: fallback.reply,
      commands: fallback.commands,
      provider: 'local-ultron-fallback',
      warning: err?.message,
    });
  }
});

// Real-time Wireless Mobile Bridge (SSE relay between Laptop & Mobile phone)
interface BridgeClient {
  id: string;
  res: express.Response;
  deviceType: string;
}

const bridgeRooms = new Map<string, BridgeClient[]>();

app.get('/api/bridge/stream', (req, res) => {
  const room = (req.query.room as string) || 'default';
  const deviceType = (req.query.type as string) || 'mobile';
  const clientId = Math.random().toString(36).substring(2, 9);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const client: BridgeClient = { id: clientId, res, deviceType };
  const clients = bridgeRooms.get(room) || [];
  clients.push(client);
  bridgeRooms.set(room, clients);

  console.log(`[Bridge] ${deviceType} connected to room '${room}' (Total: ${clients.length})`);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, total: clients.length })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const updated = (bridgeRooms.get(room) || []).filter((c) => c.id !== clientId);
    bridgeRooms.set(room, updated);
    console.log(`[Bridge] ${deviceType} disconnected from room '${room}' (Remaining: ${updated.length})`);
  });
});

app.post('/api/bridge/dispatch', (req, res) => {
  const { room = 'default', command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  const clients = bridgeRooms.get(room) || [];
  let dispatchedCount = 0;
  clients.forEach((client) => {
    try {
      client.res.write(`data: ${JSON.stringify(command)}\n\n`);
      dispatchedCount++;
    } catch {
      // stale
    }
  });

  return res.json({
    success: true,
    dispatchedTo: dispatchedCount,
    room,
  });
});

app.get('/api/bridge/status', (req, res) => {
  const room = (req.query.room as string) || 'default';
  const clients = bridgeRooms.get(room) || [];
  const mobileCount = clients.filter((c) => c.deviceType === 'mobile').length;
  return res.json({
    totalClients: clients.length,
    mobileCount,
    isMobileLinked: mobileCount > 0,
    room,
  });
});

// Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ULTRON-CORE] Operating system active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
