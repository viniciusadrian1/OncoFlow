async (page) => {
  const result = {};
  let sent = 0;
  let transcribed = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/paciente/conversa') sent++;
  });
  await page.addInitScript(() => {
    window.__liaTest = { calls: 0, streams: [], contexts: [], gain: null, utterance: null };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      window.__liaTest.calls++;
      const audio = new AudioContext();
      const source = audio.createOscillator();
      const gain = audio.createGain();
      const destination = audio.createMediaStreamDestination();
      gain.gain.value = 0;
      source.frequency.value = 220;
      source.connect(gain).connect(destination);
      source.start();
      await audio.resume();
      window.__liaTest.gain = gain;
      window.__liaTest.contexts.push(audio);
      window.__liaTest.streams.push(destination.stream);
      return destination.stream;
    }});
    speechSynthesis.speak = utterance => {
      window.__liaTest.utterance = utterance;
      setTimeout(() => utterance.dispatchEvent(new Event('start')), 0);
    };
    speechSynthesis.cancel = () => {
      window.__liaTest.utterance?.dispatchEvent(new Event('end'));
      window.__liaTest.utterance = null;
    };
  });
  await page.route('**/api/transcrever-audio', async route => {
    const body = route.request().postDataJSON();
    if (!body.audioBase64 || !body.mimeType) throw new Error('Missing real MediaRecorder payload');
    transcribed++;
    await route.fulfill({ json: { sucesso: true, transcricao: 'When is my next appointment?' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3103/paciente');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: /Talk to Lia/ }).click();
  await page.getByRole('button', { name: 'Start speaking', exact: true }).waitFor();
  if ((await page.evaluate(() => window.__liaTest.calls)) !== 0) throw new Error('Microphone started automatically');
  result.explicitStart = true;
  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).waitFor();
  const silence = await page.locator('.lia-voice-visual .lia-orb').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--audio-level')));
  await page.evaluate(() => { window.__liaTest.gain.gain.value = .18; });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.lia-voice-visual .lia-orb')).getPropertyValue('--audio-level')) > .35);
  const level = await page.locator('.lia-voice-visual .lia-orb').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--audio-level')));
  if (level <= silence + .2) throw new Error('Orb does not react to input audio');
  result.realAudioMeter = { silence, level };
  await page.screenshot({ path: 'C:/Users/luizh/OneDrive/Documentos/ChatGPT/MIT HACKING MEDICINE/outputs/OncoFlow_Lia_Ouvindo.png', scale: 'css' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.lia-voice-visual .lia-orb')).getPropertyValue('--audio-level')) === 0);
  result.reducedMotion = (await page.locator('.lia-orb-fold-front').first().evaluate(el => getComputedStyle(el).animationName)) === 'none';
  if (!result.reducedMotion) throw new Error('Reduced motion ignored');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Review before sending', exact: true });
  await draft.waitFor();
  if (sent !== 0) throw new Error('Transcript sent before review');
  if (!(await page.evaluate(() => window.__liaTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))))) throw new Error('Microphone remained active');
  result.reviewBeforeSend = true;
  result.tracksStopped = true;
  await draft.fill('I want to talk to my nurse.');
  await page.screenshot({ path: 'C:/Users/luizh/OneDrive/Documentos/ChatGPT/MIT HACKING MEDICINE/outputs/OncoFlow_Lia_Revisao.png', scale: 'css' });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'Request contact', exact: true }).waitFor();
  await page.locator('.lia-voice-visual .lia-orb[data-estado="falando"]').waitFor();
  await page.evaluate(() => {
    const utterance = window.__liaTest.utterance;
    utterance.dispatchEvent(new SpeechSynthesisEvent('boundary', { utterance, charIndex: 0, charLength: 7, name: 'word' }));
  });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.lia-voice-visual .lia-orb')).getPropertyValue('--audio-level')) > .3);
  result.speechPlaybackEvents = true;
  await page.getByRole('button', { name: 'Stop audio', exact: true }).click();
  await page.getByRole('button', { name: 'Request contact', exact: true }).click();
  await page.getByText('I forwarded your request to the nursing team.', { exact: false }).waitFor();
  result.confirmationPreserved = true;
  if (sent !== 1 || transcribed !== 1) throw new Error('Unexpected message/transcription count');
  result.calls = { messages: sent, transcriptions: transcribed, providerCalls: 0, physicalMicrophone: false };
  await page.evaluate(() => { speechSynthesis.cancel(); window.__liaTest.contexts.forEach(context => context.close()); });
  return result;
}
