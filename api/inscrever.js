const crypto = require('node:crypto');

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assinar = (id, acao) => crypto.createHmac('sha256', process.env.SECRET).update(`${id}:${acao}`).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b.site) return res.status(200).json({ ok: true });

  const nome = String(b.nome || '').trim().slice(0, 80);
  const plataforma = b.plataforma === 'YouTube' ? 'YouTube' : 'TikTok';
  const usuario = String(b.usuario || '').trim().slice(0, 60);
  const discord = String(b.discord || '').trim().slice(0, 60);
  const email = String(b.email || '').trim().slice(0, 120);
  if (!nome || !usuario || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ erro: 'Preencha nome, usuário e um email válido.' });
  }

  const { SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY, EMAIL_ADMIN, EMAIL_FROM, SITE_URL } = process.env;

  const salvar = await fetch(`${SUPABASE_URL}/rest/v1/inscricoes`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    },
    body: JSON.stringify({ nome, plataforma, usuario, discord, email })
  });
  if (!salvar.ok) return res.status(500).json({ erro: 'Erro ao salvar a inscrição.' });
  const [linha] = await salvar.json();
  const id = linha.id;

  const link = acao => `${SITE_URL}/api/decidir?id=${id}&acao=${acao}&token=${assinar(id, acao)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px">
      <h2>Nova inscrição na GOD</h2>
      <p><b>Nome:</b> ${esc(nome)}<br>
         <b>${plataforma}:</b> ${esc(usuario)}<br>
         <b>Discord:</b> ${esc(discord || '—')}<br>
         <b>Email:</b> ${esc(email)}</p>
      <p>
        <a href="${link('aprovar')}" style="background:#16a34a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:bold">✅ Aprovar</a>
        &nbsp;
        <a href="${link('negar')}" style="background:#dc2626;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:bold">❌ Negar</a>
      </p>
    </div>`;
  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: EMAIL_ADMIN, subject: `Nova inscrição: ${nome} (${plataforma} ${usuario})`, html })
  });
  if (!envio.ok) return res.status(500).json({ erro: 'Inscrição salva, mas o aviso por email falhou.' });

  return res.status(200).json({ ok: true });
};
