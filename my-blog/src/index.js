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
  return `${payload}.${signSync(payload, secret)}`; // 简化同步签名，实际用异步
}
// (异步签名稍后在 handler 中使用)

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
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1 小时
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

// ====== 页面模板 ======
const baseCSS = `
body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
h1, h2 { color: #333; }
form { display: flex; flex-direction: column; gap: 1rem; }
input, textarea { padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 0.6rem 1.2rem; background: #0077cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
button:hover { background: #005fa3; }
a { color: #0077cc; text-decoration: none; }
a:hover { text-decoration: underline; }
.post { margin-bottom: 2rem; }
.post h2 { margin-bottom: 0.25rem; }
.post .meta { font-size: 0.9rem; color: #666; }
.flash { background: #ffdddd; border: 1px solid red; padding: 0.5rem; }
`;

// 首页模板
function homepageTemplate(posts) {
  const list = posts.map(p => `
    <div class="post">
      <h2><a href="/post/${p.id}">${escapeHtml(p.title)}</a></h2>
      <div class="meta">${new Date(p.date).toLocaleDateString()}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的博客</title>
  <style>${baseCSS}</style>
</head>
<body>
  <h1>我的博客</h1>
  <a href="/admin">管理</a>
  <hr>
  ${list || '<p>还没有文章。</p>'}
</body>
</html>`;
}

// 文章详情模板
function postTemplate(post) {
  return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)}</title>
  <style>${baseCSS}</style>
</head>
<body>
  <p><a href="/">&larr; 返回首页</a></p>
  <article>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="meta">${new Date(post.date).toLocaleString()}</p>
    <div>${escapeHtml(post.content).replace(/\n/g, '<br>')}</div>
  </article>
</body>
</html>`;
}

// 登录页面模板
function loginTemplate(error = '') {
  const errorMsg = error ? `<div class="flash">${escapeHtml(error)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 - 博客管理</title>
  <style>${baseCSS}</style>
</head>
<body>
  <h1>管理员登录</h1>
  ${errorMsg}
  <form method="post" action="/login">
    <label>密码</label>
    <input type="password" name="password" required autofocus>
    <button type="submit">登录</button>
  </form>
  <p><a href="/">&larr; 返回首页</a></p>
</body>
</html>`;
}

// 管理后台模板（纯前端 SPA 风格）
function adminTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文章管理</title>
  <style>${baseCSS}
    .post-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding: 0.5rem; background: #f9f9f9; border-radius: 4px; }
    .post-item span { font-weight: bold; }
    .actions button { margin-left: 0.5rem; }
    #message { margin: 1rem 0; padding: 0.5rem; display: none; }
    .success { background: #d4edda; border: 1px solid green; }
    .error { background: #ffdddd; border: 1px solid red; }
  </style>
</head>
<body>
  <h1>文章管理</h1>
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <a href="/">&larr; 查看博客</a>
    <a href="/logout">退出登录</a>
  </div>
  <hr>
  <div id="message"></div>
  <form id="post-form">
    <input type="hidden" id="post-id">
    <label>标题</label>
    <input type="text" id="title" required>
    <label>内容</label>
    <textarea id="content" rows="6" required></textarea>
    <div>
      <button type="submit">保存</button>
      <button type="button" id="cancel-btn" style="background:#666">取消</button>
    </div>
  </form>
  <hr>
  <h2>现有文章</h2>
  <div id="posts-list">加载中...</div>

  <script>
    const form = document.getElementById('post-form');
    const titleEl = document.getElementById('title');
    const contentEl = document.getElementById('content');
    const idEl = document.getElementById('post-id');
    const listEl = document.getElementById('posts-list');
    const cancelBtn = document.getElementById('cancel-btn');
    const messageEl = document.getElementById('message');

    function showMessage(text, isError = false) {
      messageEl.textContent = text;
      messageEl.className = isError ? 'error' : 'success';
      messageEl.style.display = 'block';
      setTimeout(() => messageEl.style.display = 'none', 3000);
    }

    function resetForm() {
      idEl.value = '';
      titleEl.value = '';
      contentEl.value = '';
    }

    cancelBtn.onclick = resetForm;

    async function loadPosts() {
      try {
        const res = await fetch('/api/posts');
        if (!res.ok) throw new Error('Failed to load');
        const posts = await res.json();
        listEl.innerHTML = posts.map(p => 
          \`<div class="post-item">
            <span>\${escapeHtml(p.title)}</span>
            <small>\${new Date(p.date).toLocaleDateString()}</small>
            <div class="actions">
              <button onclick="editPost('\${p.id}')">编辑</button>
              <button onclick="deletePost('\${p.id}')" style="background:#cc0000">删除</button>
            </div>
          </div>\`
        ).join('');
      } catch (e) {
        listEl.innerHTML = '加载失败';
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
    // 配置：优先使用环境变量，其次默认值
    const password = env.BLOG_PASSWORD || 'admin';
    const secret = env.SECRET_KEY || 'change-me-to-a-random-string';
    const kv = env.MY_BLOG_KV; // KV 绑定名称必须一致

    const url = new URL(request.url);
    const { pathname, search } = url;

    // 处理静态资源（可选）
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
    // API 中间件：验证登录
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
        // 更新索引
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
        // 更新索引中的标题
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
      // 从索引中移除
      const index = await getPostIndex(kv);
      await setPostIndex(kv, index.filter(p => p.id !== id));
      return json({ success: true });
    }

    // 其他路径返回 404
    return html('Page Not Found', 404);
  }
};
