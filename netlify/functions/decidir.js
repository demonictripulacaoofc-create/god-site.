const crypto = require('node:crypto');

const assinar = (id, acao) => crypto.createHmac('sha256', process.env.SECRET).update(`${id}:${acao}`).digest('hex');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pagina = (statusCode, titulo, texto) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;background:#0A0720;color:#E8ECFF;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:1rem"><div><h1>${titulo}</h1><p>${texto}</p></div>`
});

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const id = q.id || '', acao = q.acao || '', token = q.token || '';
  if (!['aprovar', 'negar'].includes(acao) || !/^[0-9a-f-]{36}$/i.test(id)) return pagina(400, 'Link inválido', 'Confira o link do email.');

  const esperado = Buffer.from(assinar(id, acao));
  const recebido = Buffer.from(String(token));
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
    return pagina(403, 'Token inválido', 'Este link não é válido.');
  }

  const { SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY, EMAIL_FROM } = process.env;
  const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  const busca = await fetch(`${SUPABASE_URL}/rest/v1/inscricoes?id=eq.${id}&select=*`, { headers: H });
  const [linha] = busca.ok ? await busca.json() : [];
  if (!linha) return pagina(404, 'Inscrição não encontrada', 'Ela pode ter sido removida.');
  if (linha.status !== 'pendente') return pagina(200, 'Já decidido', `Esta inscrição já está como <b>${esc(linha.status)}</b>.`);

  const status = acao === 'aprovar' ? 'aprovado' : 'negado';
  const up = await fetch(`${SUPABASE_URL}/rest/v1/inscricoes?id=eq.${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ status, decidido_em: new Date().toISOString() })
  });
  if (!up.ok) return pagina(500, 'Erro', 'Não consegui salvar a decisão.');

  const assunto = status === 'aprovado' ? 'Você entrou na GOD!' : 'Sobre sua inscrição na GOD';
  const corpo = status === 'aprovado'
    ? `<h2>Você entrou na GOD! 🎉</h2><p>Olá, ${esc(linha.nome)}! Sua inscrição foi aprovada. Em breve você recebe os próximos passos.</p>`
    : `<h2>Não foi dessa vez</h2><p>Olá, ${esc(linha.nome)}. Sua inscrição não foi aprovada agora, mas você pode tentar de novo mais pra frente.</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: linha.email, subject: assunto, html: corpo })
  });

  return pagina(200, status === 'aprovado' ? '✅ Aprovado' : '❌ Negado', `${esc(linha.nome)} foi ${status}. O candidato já recebeu o email.`);
};
