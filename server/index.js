const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');
const fs = require('fs');

const app = express();
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));

const auth = basicAuth({
  users: { [process.env.CMS_USER || 'admin']: process.env.CMS_PASS || 'change-me' },
  challenge: true,
  realm: 'Scale42 CMS',
});

app.use('/cms', auth, express.static(path.join(ROOT, 'cms-ui')));
app.use('/api', auth, require('./routes/people'));
app.use('/api', auth, require('./routes/publish'));

app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
}));

app.use((req, res) => {
  const fallback = path.join(ROOT, '404.html');
  if (fs.existsSync(fallback)) return res.status(404).sendFile(fallback);
  res.status(404).send('Not found');
});

app.listen(PORT, () => console.log(`Scale42 server on :${PORT}`));
