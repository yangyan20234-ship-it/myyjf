const articleList = document.getElementById('article-list');
const articleContent = document.getElementById('article-content');

function renderPosts() {
    articleList.innerHTML = posts.map(post => `
        <div class="article-item" onclick="viewPost('${post.slug}')">
            <h2>${post.title}</h2>
            <p class="date">${post.date}</p>
        </div>
    `).join('');
}

async function viewPost(slug) {
    const post = posts.find(p => p.slug === slug);
    if (!post) return;
    
    try {
        const response = await fetch(`posts/${slug}.md`);
        const md = await response.text();
        
        articleList.classList.add('hidden');
        articleContent.classList.remove('hidden');
        articleContent.innerHTML = `
            <a href="#" class="back-link" onclick="showList(event)">← 返回列表</a>
            <h1>${post.title}</h1>
            <p class="meta">${post.date}</p>
            <div class="markdown-body">${parseMarkdown(md)}</div>
        `;
    } catch (e) {
        articleContent.innerHTML = '<p>加载文章失败</p>';
    }
}

function showList(e) {
    if (e) e.preventDefault();
    articleList.classList.remove('hidden');
    articleContent.classList.add('hidden');
}

function parseMarkdown(md) {
    return md
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
        .replace(/^\- (.*$)/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>');
}

renderPosts();