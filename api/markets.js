export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { offset = 0, limit = 100 } = req.query;

  try {
    const r = await fetch(
      `https://gamma-api.polymarket.com/markets?limit=${limit}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
