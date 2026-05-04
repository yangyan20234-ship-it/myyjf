// ====== 配置 ======
// 强烈建议通过环境变量（wrangler.toml 或 Cloudflare 控制台设置）覆盖这些默认值
// BLOG_PASSWORD: 登录密码
// SECRET_KEY: 用于签名会话的密钥

// ====== 工具函数 ======
function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 设置/清除会话 cookie
function setCookie(username, expires, secret) {
  const payload = btoa(JSON.stringify({ username, exp: expires }));
  return `${payload}.${signSync(payload, secret)}`;
}

// HMAC 签名
async function sign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 验证会话，返回用户名或 null
async function getSession(request, secret) {
  const cookie = request.headers.get('Cookie') || '';
  const sessionCookie = cookie.split('; ').find(c => c.startsWith('session='));
  if (!sessionCookie) return null;
  const token = sessionCookie.slice('session='.length);
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp < Date.now() / 1000) return null;
    const validSig = await sign(payloadB64, secret);
    if (sig !== validSig) return null;
    return payload.username;
  } catch {
    return null;
  }
}

// 创建带会话的响应
async function createSessionResponse(username, secret) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = btoa(JSON.stringify({ username, exp }));
  const sig = await sign(payload, secret);
  const token = `${payload}.${sig}`;
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin',
      'Set-Cookie': `session=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
    }
  });
}

// 清除会话
function clearSessionResponse(path = '/') {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': path,
      'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
    }
  });
}

// ====== 高级UI系统 ======
const baseCSS = `
:root {
  --bg-primary: #fafafa;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --accent: #2d2d2d;
  --accent-light: #4a4a4a;
  --border: #e8e8e8;
  --border-light: #f0f0f0;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.06);
  --shadow-lg: 0 8px 40px rgba(0,0,0,0.08);
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --font-sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-serif: 'Noto Serif SC', 'Songti SC', serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f0f0f;
    --bg-secondary: #1a1a1a;
    --bg-tertiary: #252525;
    --text-primary: #f5f5f5;
    --text-secondary: #a0a0a0;
    --text-tertiary: #666666;
    --accent: #e0e0e0;
    --accent-light: #ffffff;
    --border: #2a2a2a;
    --border-light: #333333;
    --shadow-sm: 0 2px 8px rgba(0,0,0,0.2);
    --shadow-md: 0 4px 20px rgba(0,0,0,0.3);
    --shadow-lg: 0 8px 40px rgba(0,0,0,0.4);
  }
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-size: 16px;
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.75;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: var(--text-primary);
  text-decoration: none;
  transition: var(--transition);
}

a:hover {
  color: var(--accent-light);
}

::selection {
  background: var(--accent);
  color: var(--bg-secondary);
}

/* 布局容器 */
.container {
  max-width: 780px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* 导航 */
.nav {
  padding: 2rem 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-brand {
  font-family: var(--font-serif);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.nav-brand:hover {
  color: var(--accent);
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-link {
  font-size: 0.9rem;
  color: var(--text-secondary);
  position: relative;
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: var(--transition);
}

.nav-link:hover::after {
  width: 100%;
}

/* 卡片 */
.card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem 2rem;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
  transition: var(--transition);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border);
}

/* 文章卡片 */
.post-card {
  margin-bottom: 1.5rem;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
}

.post-card:nth-child(1) { animation-delay: 0.1s; }
.post-card:nth-child(2) { animation-delay: 0.2s; }
.post-card:nth-child(3) { animation-delay: 0.3s; }
.post-card:nth-child(4) { animation-delay: 0.4s; }
.post-card:nth-child(5) { animation-delay: 0.5s; }

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.post-card h2 {
  font-family: var(--font-serif);
  font-size: 1.35rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.post-card h2 a {
  color: var(--text-primary);
}

.post-card h2 a::before {
  content: '';
  position: absolute;
  inset: 0;
}

.post-card .meta {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.post-card .meta::before {
  content: '·';
  color: var(--text-tertiary);
}

.post-card:first-child .meta::before {
  display: none;
}

.post-card .excerpt {
  margin-top: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 标题区域 */
.hero {
  text-align: center;
  padding: 4rem 0 3rem;
  opacity: 0;
  animation: fadeIn 0.8s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.hero h1 {
  font-family: var(--font-serif);
  font-size: 2.5rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
}

.hero p {
  color: var(--text-secondary);
  font-size: 1rem;
}

/* 分割线 */
.divider {
  height: 1px;
  background: linear-gradient(to right, transparent, var(--border), transparent);
  margin: 2rem 0;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  border: none;
  gap: 0.5rem;
}

.btn-primary {
  background: var(--accent);
  color: var(--bg-secondary);
}

.btn-primary:hover {
  background: var(--accent-light);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

/* 表单 */
.form-group {
  margin-bottom: 1.25rem;
}

.form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 0.875rem 1rem;
  font-size: 1rem;
  font-family: inherit;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  transition: var(--transition);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(45, 45, 45, 0.1);
}

.form-textarea {
  min-height: 180px;
  resize: vertical;
  line-height: 1.7;
}

/* 消息提示 */
.message {
  padding: 1rem 1.25rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-success {
  background: rgba(34, 139, 34, 0.1);
  border: 1px solid rgba(34, 139, 34, 0.3);
  color: #228b22;
}

.message-error {
  background: rgba(178, 34, 34, 0.1);
  border: 1px solid rgba(178, 34, 34, 0.3);
  color: #b22222;
}

/* 文章详情页 */
.article {
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
}

.article-header {
  margin-bottom: 2.5rem;
}

.article-title {
  font-family: var(--font-serif);
  font-size: 2rem;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.article-meta {
  color: var(--text-tertiary);
  font-size: 0.9rem;
}

.article-content {
  font-size: 1.05rem;
  line-height: 1.9;
  color: var(--text-primary);
}

.article-content p {
  margin-bottom: 1.5rem;
}

.article-content p:empty {
  display: none;
}

/* 返回按钮 */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 2rem;
  transition: var(--transition);
}

.back-link:hover {
  color: var(--text-primary);
  transform: translateX(-4px);
}

.back-link svg {
  width: 18px;
  height: 18px;
}

/* 空状态 */
.empty {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

/* 管理后台 */
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.admin-title {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  font-weight: 500;
}

.admin-actions {
  display: flex;
  gap: 1rem;
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.post-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  transition: var(--transition);
}

.post-item:hover {
  background: var(--border-light);
}

.post-item-title {
  font-weight: 500;
  flex: 1;
  margin-right: 1rem;
}

.post-item-date {
  color: var(--text-tertiary);
  font-size: 0.85rem;
  margin-right: 1rem;
}

.post-item-actions {
  display: flex;
  gap: 0.5rem;
}

.post-item-actions .btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
}

/* 登录页 */
.login-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 4rem 2rem;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
}

.login-title {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  font-weight: 500;
  text-align: center;
  margin-bottom: 2rem;
}

/* 页脚 */
.footer {
  text-align: center;
  padding: 3rem 0;
  color: var(--text-tertiary);
  font-size: 0.85rem;
  border-top: 1px solid var(--border-light);
  margin-top: 4rem;
}

/* 响应式 */
@media (max-width: 640px) {
  html {
    font-size: 15px;
  }

  .container {
    padding: 0 1.25rem;
  }

  .hero {
    padding: 3rem 0 2rem;
  }

  .hero h1 {
    font-size: 2rem;
  }

  .article-title {
    font-size: 1.5rem;
  }

  .post-card {
    padding: 1.25rem 1.5rem;
  }

  .post-card h2 {
    font-size: 1.2rem;
  }

  .admin-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .post-item {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .post-item-title {
    width: 100%;
    margin-right: 0;
  }

  .post-item-date {
    margin-right: 0;
  }

  .nav-links {
    gap: 1rem;
  }
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
`;

// 首页模板
function homepageTemplate(posts) {
  const list = posts.map((p, i) => {
    const date = new Date(p.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
      <article class="post-card card">
        <h2><a href="/post/${p.id}">${escapeHtml(p.title)}</a></h2>
        <div class="meta">${date}</div>
      </article>
    `;
  }).join('');

  const emptyState = posts.length === 0 ? `
    <div class="empty">
      <div class="empty-icon">📝</div>
      <p>还没有文章</p>
      <p style="font-size: 0.85rem; margin-top: 0.5rem;">开始写你的第一篇文章吧</p>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的博客</title>
  <meta name="description" content="一个安静的角落">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${baseCSS}</style>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/" class="nav-brand">静思阁</a>
      <div class="nav-links">
        <a href="/" class="nav-link">首页</a>
        <a href="/admin" class="nav-link">管理</a>
      </div>
    </nav>

    <header class="hero">
      <h1>静思阁</h1>
      <p>思考 · 记录 · 分享</p>
    </header>

    <div class="divider"></div>

    <main>
      ${list || emptyState}
    </main>

    <footer class="footer">
      <p>© ${new Date().getFullYear()} 静思阁 · 用心书写</p>
    </footer>
  </div>
</body>
</html>`;
}

// 文章详情模板
function postTemplate(post) {
  const date = new Date(post.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const content = escapeHtml(post.content).split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} - 静思阁</title>
  <meta name="description" content="${escapeHtml(post.title)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${baseCSS}</style>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/" class="nav-brand">静思阁</a>
      <div class="nav-links">
        <a href="/" class="nav-link">首页</a>
        <a href="/admin" class="nav-link">管理</a>
      </div>
    </nav>

    <main class="article">
      <a href="/" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回首页
      </a>

      <header class="article-header">
        <h1 class="article-title">${escapeHtml(post.title)}</h1>
        <div class="article-meta">${date}</div>
      </header>

      <div class="article-content">
        ${content}
      </div>
    </main>

    <footer class="footer">
      <p>© ${new Date().getFullYear()} 静思阁 · 用心书写</p>
    </footer>
  </div>
</body>
</html>`;
}

// 登录页面模板
function loginTemplate(error = '') {
  const errorMsg = error ? `<div class="message message-error">${escapeHtml(error)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 - 静思阁</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${baseCSS}</style>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/" class="nav-brand">静思阁</a>
    </nav>

    <div class="login-container">
      <h1 class="login-title">管理员登录</h1>
      ${errorMsg}
      <form method="post" action="/login" class="card" style="padding: 2rem;">
        <div class="form-group">
          <label class="form-label" for="password">密码</label>
          <input type="password" id="password" name="password" class="form-input" required autofocus placeholder="请输入密码">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">登录</button>
      </form>
      <div style="text-align: center; margin-top: 1.5rem;">
        <a href="/" class="nav-link">返回首页</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// 管理后台模板
function adminTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文章管理 - 静思阁</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${baseCSS}</style>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/" class="nav-brand">静思阁</a>
      <div class="nav-links">
        <a href="/" class="nav-link">首页</a>
        <a href="/logout" class="nav-link">退出</a>
      </div>
    </nav>

    <div class="hero" style="padding: 2rem 0;">
      <h1 style="font-size: 1.75rem;">文章管理</h1>
    </div>

    <div class="divider"></div>

    <div id="message"></div>

    <form id="post-form" class="card" style="margin-bottom: 2rem;">
      <input type="hidden" id="post-id">
      <div class="form-group">
        <label class="form-label" for="title">标题</label>
        <input type="text" id="title" class="form-input" required placeholder="输入文章标题">
      </div>
      <div class="form-group">
        <label class="form-label" for="content">内容</label>
        <textarea id="content" class="form-input form-textarea" required placeholder="输入文章内容"></textarea>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button type="submit" class="btn btn-primary">保存</button>
        <button type="button" id="cancel-btn" class="btn btn-ghost">取消</button>
      </div>
    </form>

    <h2 style="font-family: var(--font-serif); font-size: 1.25rem; font-weight: 500; margin-bottom: 1rem;">现有文章</h2>
    <div id="posts-list" class="post-list">
      <div class="empty">
        <p>加载中...</p>
      </div>
    </div>

    <footer class="footer">
      <p>© ${new Date().getFullYear()} 静思阁 · 用心书写</p>
    </footer>
  </div>

  <script>
    const form = document.getElementById('post-form');
    const titleEl = document.getElementById('title');
    const contentEl = document.getElementById('content');
    const idEl = document.getElementById('post-id');
    const listEl = document.getElementById('posts-list');
    const cancelBtn = document.getElementById('cancel-btn');
    const messageEl = document.getElementById('message');

    function showMessage(text, isError = false) {
      messageEl.innerHTML = '<div class="message ' + (isError ? 'message-error' : 'message-success') + '">' + text + '</div>';
      setTimeout(() => messageEl.innerHTML = '', 3000);
    }

    function resetForm() {
      idEl.value = '';
      titleEl.value = '';
      contentEl.value = '';
      titleEl.focus();
    }

    cancelBtn.onclick = resetForm;

    async function loadPosts() {
      try {
        const res = await fetch('/api/posts');
        if (!res.ok) throw new Error('Failed to load');
        const posts = await res.json();
        if (posts.length === 0) {
          listEl.innerHTML = '<div class="empty"><p>暂无文章</p></div>';
          return;
        }
        listEl.innerHTML = posts.map(p => 
          '<div class="post-item">' +
            '<span class="post-item-title">' + escapeHtml(p.title) + '</span>' +
            '<span class="post-item-date">' + new Date(p.date).toLocaleDateString('zh-CN') + '</span>' +
            '<div class="post-item-actions">' +
              '<button class="btn btn-secondary" onclick="editPost(\\'' + p.id + '\\')">编辑</button>' +
              '<button class="btn btn-secondary" onclick="deletePost(\\'' + p.id + '\\')" style="background:#8b0000;color:#fff;">删除</button>' +
            '</div>' +
          '</div>'
        ).join('');
      } catch (e) {
        listEl.innerHTML = '<div class="empty"><p>加载失败</p></div>';
      }
    }

    async function savePost(title, content, id) {
      const url = id ? '/api/posts/' + id : '/api/posts';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || '保存失败');
      }
      return res.json();
    }

    async function deletePost(id) {
      if (!confirm('确定删除这篇文章？')) return;
      const res = await fetch('/api/posts/' + id, { method: 'DELETE' });
      if (res.ok) {
        showMessage('已删除');
        loadPosts();
        if (idEl.value === id) resetForm();
      } else {
        showMessage('删除失败', true);
      }
    }

    window.editPost = async function(id) {
      const res = await fetch('/api/posts/' + id);
      if (res.ok) {
        const post = await res.json();
        idEl.value = post.id;
        titleEl.value = post.title;
        contentEl.value = post.content;
        titleEl.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      const content = contentEl.value.trim();
      if (!title || !content) return;
      try {
        await savePost(title, content, idEl.value);
        showMessage(idEl.value ? '已更新' : '已发布');
        loadPosts();
        resetForm();
      } catch (err) {
        showMessage(err.message, true);
      }
    };

    loadPosts();
  </script>
</body>
</html>`;
}

// 转义 HTML，防止 XSS
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ====== KV 数据操作 ======
async function getPostIndex(kv) {
  const raw = await kv.get('post:index');
  return raw ? JSON.parse(raw) : [];
}

async function setPostIndex(kv, index) {
  await kv.put('post:index', JSON.stringify(index));
}

async function getPost(kv, id) {
  const raw = await kv.get(`post:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function savePost(kv, post) {
  await kv.put(`post:${post.id}`, JSON.stringify(post));
}

async function deletePostById(kv, id) {
  await kv.delete(`post:${id}`);
}

// ====== 主 Worker ======
export default {
  async fetch(request, env) {
    const password = env.BLOG_PASSWORD || 'admin';
    const secret = env.SECRET_KEY || 'change-me-to-a-random-string';
    const kv = env.MY_BLOG_KV;

    const url = new URL(request.url);
    const { pathname, search } = url;

    if (pathname === '/favicon.ico') return new Response(null, { status: 404 });

    // 1. 首页
    if (request.method === 'GET' && pathname === '/') {
      const index = await getPostIndex(kv);
      return html(homepageTemplate(index));
    }

    // 2. 文章详情
    if (request.method === 'GET' && pathname.startsWith('/post/')) {
      const id = pathname.slice('/post/'.length);
      if (!id) return html('Not Found', 404);
      const post = await getPost(kv, id);
      if (!post) return html('文章不存在', 404);
      return html(postTemplate(post));
    }

    // 3. 登录页面 GET
    if (request.method === 'GET' && pathname === '/login') {
      return html(loginTemplate());
    }

    // 4. 登录 POST
    if (request.method === 'POST' && pathname === '/login') {
      const form = await request.formData();
      const pwd = form.get('password') || '';
      if (pwd !== password) {
        return html(loginTemplate('密码错误'));
      }
      return createSessionResponse('admin', secret);
    }

    // 5. 注销
    if (request.method === 'GET' && pathname === '/logout') {
      return clearSessionResponse('/');
    }

    // 6. 管理后台 (需登录)
    if (pathname === '/admin' || pathname === '/admin/') {
      const user = await getSession(request, secret);
      if (!user) {
        return new Response(null, { status: 302, headers: { Location: '/login?redirect=/admin' } });
      }
      return html(adminTemplate());
    }

    // ===== API 路由 =====
    async function requireAuth() {
      const user = await getSession(request, secret);
      if (!user) {
        return json({ error: 'Unauthorized' }, 401);
      }
      return null;
    }

    // GET /api/posts - 获取所有文章列表
    if (request.method === 'GET' && pathname === '/api/posts') {
      const index = await getPostIndex(kv);
      return json(index);
    }

    // GET /api/posts/:id - 获取单篇文章详情
    if (request.method === 'GET' && pathname.startsWith('/api/posts/')) {
      const id = pathname.slice('/api/posts/'.length);
      if (!id) return json({ error: 'Missing id' }, 400);
      const post = await getPost(kv, id);
      if (!post) return json({ error: 'Not found' }, 404);
      return json(post);
    }

    // POST /api/posts - 创建新文章
    if (request.method === 'POST' && pathname === '/api/posts') {
      const authError = await requireAuth();
      if (authError) return authError;
      try {
        const body = await request.json();
        if (!body.title || !body.content) return json({ error: 'Title and content required' }, 400);
        const id = crypto.randomUUID();
        const post = {
          id,
          title: body.title,
          content: body.content,
          date: new Date().toISOString(),
        };
        await savePost(kv, post);
        const index = await getPostIndex(kv);
        index.unshift({ id: post.id, title: post.title, date: post.date });
        await setPostIndex(kv, index);
        return json(post, 201);
      } catch (e) {
        return json({ error: 'Invalid JSON' }, 400);
      }
    }

    // PUT /api/posts/:id - 更新文章
    if (request.method === 'PUT' && pathname.startsWith('/api/posts/')) {
      const authError = await requireAuth();
      if (authError) return authError;
      const id = pathname.slice('/api/posts/'.length);
      if (!id) return json({ error: 'Missing id' }, 400);
      const existing = await getPost(kv, id);
      if (!existing) return json({ error: 'Not found' }, 404);
      try {
        const body = await request.json();
        if (!body.title || !body.content) return json({ error: 'Title and content required' }, 400);
        const updatedPost = {
          ...existing,
          title: body.title,
          content: body.content,
          updatedAt: new Date().toISOString(),
        };
        await savePost(kv, updatedPost);
        const index = await getPostIndex(kv);
        const idx = index.findIndex(p => p.id === id);
        if (idx !== -1) {
          index[idx].title = body.title;
          index[idx].date = updatedPost.updatedAt;
          await setPostIndex(kv, index);
        }
        return json(updatedPost);
      } catch (e) {
        return json({ error: 'Invalid JSON' }, 400);
      }
    }

    // DELETE /api/posts/:id - 删除文章
    if (request.method === 'DELETE' && pathname.startsWith('/api/posts/')) {
      const authError = await requireAuth();
      if (authError) return authError;
      const id = pathname.slice('/api/posts/'.length);
      if (!id) return json({ error: 'Missing id' }, 400);
      if (!(await getPost(kv, id))) return json({ error: 'Not found' }, 404);
      await deletePostById(kv, id);
      const index = await getPostIndex(kv);
      await setPostIndex(kv, index.filter(p => p.id !== id));
      return json({ success: true });
    }

    return html('Page Not Found', 404);
  }
};