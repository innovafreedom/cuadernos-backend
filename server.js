require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '63693750';
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

// Garantiza que la base de datos tenga la estructura correcta al iniciar
if (!fs.existsSync(DATA_FILE) || fs.readFileSync(DATA_FILE, 'utf8').trim() === '') {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ blogs: [], posts: [] }, null, 2));
}

function readData() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return { blogs: parsed.blogs || [], posts: parsed.posts || [] };
  } catch (e) {
    return { blogs: [], posts: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, uid() + ext);
    }
  })
});

// ---------- API BLOGS ----------

// Listar blogs (Paso crítico que causaba el "Cargando...")
app.get('/api/blogs', (req, res) => {
  const data = readData();
  res.json(data.blogs);
});

// Crear blog
app.post('/api/blogs', (req, res) => {
  const { title, author, tagline, color, password } = req.body;
  if (!title || !author || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const data = readData();
  const blog = {
    id: uid(),
    title: String(title),
    author: String(author),
    tagline: String(tagline || ''),
    color: color || '#2F6E62',
    password: String(password),
    createdAt: Date.now()
  };
  data.blogs.push(blog);
  writeData(data);
  res.json(blog);
});

// Ver un blog específico y sus entradas
app.get('/api/blogs/:id', (req, res) => {
  const data = readData();
  const blog = data.blogs.find(b => b.id === req.params.id);
  if (!blog) return res.status(404).json({ error: 'No encontrado' });
  const posts = data.posts
    .filter(p => p.blogId === blog.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ...blog, posts });
});

// Crear entrada de blog (Soporta video local O link de YouTube de forma opcional)
app.post('/api/blogs/:id/posts', upload.single('video'), (req, res) => {
  const data = readData();
  const blog = data.blogs.find(b => b.id === req.params.id);
  if (!blog) return res.status(404).json({ error: 'Blog no encontrado' });

  const { title, text, password, ytUrl } = req.body;
  if (String(password) !== String(blog.password)) {
    return res.status(403).json({ error: 'Contraseña incorrecta' });
  }

  let finalVideoUrl = null;
  if (req.file) {
    finalVideoUrl = `/uploads/${req.file.filename}`;
  } else if (ytUrl && ytUrl.trim() !== '') {
    finalVideoUrl = `/api/proxy-youtube?url=${encodeURIComponent(ytUrl.trim())}`;
  }

  const post = {
    id: uid(),
    blogId: blog.id,
    title: String(title),
    text: String(text || ''),
    videoUrl: finalVideoUrl,
    createdAt: Date.now()
  };
  data.posts.push(post);
  writeData(data);
  res.json(post);
});

// Ruta Proxy para transmisión de YouTube en tiempo real
app.get('/api/proxy-youtube', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
      return res.status(400).send('URL de YouTube no válida');
    }
    res.header('Content-Type', 'video/mp4');
    ytdl(videoUrl, { format: 'mp4', quality: 'highestvideo', filter: 'audioandvideo' }).pipe(res);
  } catch (error) {
    res.status(500).send('Error en streaming');
  }
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
