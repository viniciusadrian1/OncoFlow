async (page) => {
  const base = 'http://127.0.0.1:3103';
  await page.request.post(`${base}/api/demo/reset`);
  const urgent = await page.request.post(`${base}/api/paciente/conversa`, {
    headers: { authorization: 'Bearer demo-maria' },
    data: { texto: 'I am short of breath', origem: 'texto' }
  });
  if (!urgent.ok()) throw new Error('Urgency fixture rejected');
  const state = await (await page.request.get(`${base}/api/paciente/inicio`, {
    headers: { authorization: 'Bearer demo-maria' }
  })).json();
  await page.goto(`${base}/paciente`);
  await page.getByRole('button', { name: /Talk to Lia/ }).click();
  const urgencyVisible = await page.getByRole('alert').filter({ hasText: state.avisoUrgencia.contato }).isVisible();
  const call = await page.request.post(`${base}/api/pro/pacientes/pac-maria/videochamada`, {
    headers: { 'x-demo-usuario': 'usr-camila' }, data: {}
  });
  if (!call.ok()) throw new Error('Call fixture rejected');
  const { link } = await call.json();
  await page.getByText('You are now talking with Dr. Camila Ribeiro.', { exact: true }).waitFor();
  const invitation = page.getByRole('link', { name: /Join call/ });
  const callVisible = await invitation.isVisible();
  const callLinkPreserved = callVisible && (await invitation.getAttribute('href')) === link;
  const result = { urgencyVisible, callVisible, callLinkPreserved };
  if (!Object.values(result).every(Boolean)) throw new Error(JSON.stringify(result));
  return result;
}
