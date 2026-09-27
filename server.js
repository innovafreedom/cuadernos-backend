require('dotenv').config();
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ytdl = require('@distube/ytdl-core'); // Corregido a la versión activa de la comunidad

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esto';
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ blogs: [], posts: [] }, null, 2));

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function uid() {
  return crypto.randomBytes(8).toString('hex');
}

// ---- Sesiones de admin en memoria ----
const adminTokens = new Set();
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && adminTokens.has(token)) return next();
  return res.status(401).json({ error: 'No autorizado' });
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
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB por video
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) return cb(new Error('Solo se permiten videos'));
    cb(null, true);
  }
});

// ---------- BLOGS ----------

// Crear blog (público, requiere elegir contraseña)
app.post('/api/blogs', async (req, res) => {
  const { title, author, tagline, color, password } = req.body;
  if (!title || !author || !password) {
    return res.status(400).json({ error: 'Título, autor y contraseña son obligatorios' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  const data = readData();
  const blog = {
    id: uid(),
    title: String(title).slice(0, 120),
    author: String(author).slice(0, 80),
    tagline: String(tagline || '').slice(0, 160),
    color: /^#[0-9a-fA-F]{6}\$/.test(color || '') ? color : '#2F6E62', // BUG del Regex Solucionado
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: Date.now()
  };
  data.blogs.push(blog);
  writeData(data);
  const { passwordHash, ...safeBlog } = blog;
  res.json(safeBlog);
});

// Listar blogs
app.get('/api/blogs', (req, res) => {
  const data = readData();
  res.json(data.blogs.map(({ passwordHash, ...b }) => b));
});

// Ver un blog + sus entradas
app.get('/api/blogs/:id', (req, res) => {
  const data = readData();
  const blog = data.blogs.find(b => b.id === req.params.id);
  if (!blog) return res.status(404).json({ error: 'No encontrado' });
  const posts = data.posts
    .filter(p => p.blogId === blog.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const { passwordHash, ...safeBlog } = blog;
  res.json({ ...safeBlog, posts });
});

// Crear entrada (Soporta archivo de video local O enlace URL de YouTube)
app.post('/api/blogs/:id/posts', upload.single('video'), async (req, res) => {
  const data = readData();
  const blog = data.blogs.find(b => b.id === req.params.id);
  if (!blog) return res.status(404).json({ error: 'Blog no encontrado' });

  const { title, text, password, ytUrl } = req.body;
  const ok = password && await bcrypt.compare(password, blog.passwordHash);
  if (!ok) return res.status(403).json({ error: 'Contraseña incorrecta' });
  if (!title) return res.status(400).json({ error: 'Falta el título de la entrada' });

  let finalVideoUrl = null;

  if (req.file) {
    finalVideoUrl = `/uploads/${req.file.filename}`;
  } else if (ytUrl && ytUrl.trim() !== '') {
    if (ytdl.validateURL(ytUrl)) {
      finalVideoUrl = `/api/proxy-youtube?url=${encodeURIComponent(ytUrl)}`;
    } else {
      return res.status(400).json({ error: 'URL de YouTube no válida' });
    }
  }

  const post = {
    id: uid(),
    blogId: blog.id,
    title: String(title).slice(0, 160),
    text: String(text || '').slice(0, 5000),
    videoUrl: finalVideoUrl,
    createdAt: Date.now()
  };
  data.posts.push(post);
  writeData(data);
  res.json(post);
});

// Ruta Proxy: Descarga el flujo de YouTube en tiempo real y lo sirve desde tu dominio
app.get('/api/proxy-youtube', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
      return res.status(400).send('URL de YouTube no válida');
    }
    res.header('Content-Type', 'video/mp4');
    
    ytdl(videoUrl, { 
      format: 'mp4', 
      quality: 'highestvideo',
      filter: 'audioandvideo' 
    }).on('error', (err) => {
      console.error('Error en streaming ytdl:', err);
      if (!res.headersSent) res.status(500).send('Error durante la transmisión');
    }).pipe(res);

  } catch (error) {
    console.error(error);
    res.status(500).send('Error al procesar el video de YouTube');
  }
});

// ---------- ADMIN ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.add(token);
  res.json({ token });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const data = readData();
  const blogs = data.blogs.map(({ passwordHash, ...b }) => ({
    ...b,
    posts: data.posts.filter(p => p.blogId === b.id).sort((a, b2) => b2.createdAt - a.createdAt)
  }));
  res.json(blogs);
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const data = readData();
  const post = data.posts.find(p => p.id === req.params.id);
  if (post && post.videoUrl && post.videoUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(post.videoUrl));
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
  }
  data.posts = data.posts.filter(p => p.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

app.delete('/api/admin/blogs/:id', requireAdmin, (req, res) => {
  const data = readData();
  const postsToRemove = data.posts.filter(p => p.blogId === req.params.id);
  postsToRemove.forEach(p => {
    if (p.videoUrl && p.videoUrl.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(p.videoUrl));
      fs.existsSync(filePath) && fs.unlinkSync(filePath);
    }
  });
  data.posts = data.posts.filter(p => p.blogId !== req.params.id);
  data.blogs = data.blogs.filter(b => b.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Cuadernos corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin.html`);
});