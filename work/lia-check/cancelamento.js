async (page) => {
  // Each run installs its own synthetic stream and starts in the ready voice view.
  await page.addInitScript(() => {
    window.__liaTest = { streams: [], contexts: [] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await audio.resume();
      window.__liaTest.streams.push(destination.stream);
      window.__liaTest.contexts.push(audio);
      return destination.stream;
    }});
  });
  await page.goto('http://127.0.0.1:3103/paciente');
  await page.getByRole('button', { name: /Talk to Lia/ }).click();
  const result = {};
  let messages = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/paciente/conversa') messages++;
  });
  await page.evaluate(() => {
    window.__testGetUserMediaOriginal = navigator.mediaDevices.getUserMedia;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise(resolve => {
      window.__releasePermission = async () => resolve(await window.__testGetUserMediaOriginal());
    }) });
  });
  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await page.getByRole('heading', { name: 'Getting the microphone ready…', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.__releasePermission());
  await page.waitForFunction(() => window.__liaTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  result.latePermissionStopped = true;
  await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: window.__testGetUserMediaOriginal }));
  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  if (!(await page.evaluate(() => window.__liaTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))))) throw new Error('Navigation left microphone running');
  result.navigationStopsMicrophone = true;
  await page.getByRole('button', { name: /Talk to Lia/ }).click();

  await page.unroute('**/api/transcrever-audio');
  let release;
  let reached;
  const requested = new Promise(resolve => { reached = resolve; });
  await page.route('**/api/transcrever-audio', route => {
    release = () => route.fulfill({ json: { sucesso: true, transcricao: "I can't go to my appointment." } });
    reached();
  });
  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/transcrever-audio');
  await release();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if ((await page.getByRole('textbox', { name: 'Review before sending', exact: true }).count()) !== 0) throw new Error('Cancelled transcription returned to UI');
  if (!(await page.getByRole('button', { name: 'Start speaking', exact: true }).isVisible())) throw new Error('Cancel did not restore ready state');
  if (messages !== 0) throw new Error('Cancelled operation sent a message');
  result.lateTranscriptionIgnored = true;

  await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) }));
  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await page.getByText("I couldn't use the microphone. Check the permission or keep typing.", { exact: true }).waitFor();
  await page.getByRole('button', { name: "I'd rather type", exact: true }).click();
  await page.getByRole('textbox', { name: /Message to Lia/ }).waitFor();
  result.permissionErrorAllowsText = true;
  result.cancelledMessages = messages;
  await page.evaluate(() => window.__liaTest.contexts.filter(context => context.state !== 'closed').forEach(context => context.close()));
  return result;
}
