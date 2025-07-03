/**
 * shortlink
 * 
 * 功能：
 * 1. 创建短链接 - POST /api/create
 * 2. 访问短链接 - GET /:shortId
 * 3. 查看短链接信息 - GET /api/info/:shortId
 */

// 配置
const CONFIG = {
  // 短链接的域名，部署后需要修改为实际的域名
  BASE_URL: 'https://your-worker-domain.workers.dev',
  // 短链接的长度
  SHORT_ID_LENGTH: 6,
  // 管理员密钥，用于创建短链接时的认证
  ADMIN_KEY: 'your-admin-key-here',
};

// 字符集，用于生成短链接ID
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 生成短链接URL
 * @param {string} shortId - 短链接ID
 * @returns {string} - 完整的短链接URL
 */
function generateShortUrl(shortId) {
  // 确保BASE_URL末尾没有斜杠，然后添加斜杠和shortId
  const baseUrl = CONFIG.BASE_URL.endsWith('/') 
    ? CONFIG.BASE_URL.slice(0, -1) 
    : CONFIG.BASE_URL;
  return `${baseUrl}/${shortId}`;
}

/**
 * 生成随机短链接ID
 * @param {number} length - 短链接ID的长度
 * @returns {string} - 生成的短链接ID
 */
function generateShortId(length = CONFIG.SHORT_ID_LENGTH) {
  let result = '';
  const charactersLength = CHARSET.length;
  
  // 使用加密安全的随机数生成器
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += CHARSET.charAt(randomValues[i] % charactersLength);
  }
  
  return result;
}

/**
 * 处理创建短链接的请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} - 响应对象
 */
async function handleCreateShortlink(request, env) {
  // 验证请求方法
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  try {
    // 解析请求体
    const { url, customId, adminKey } = await request.json();
    
    // 验证管理员密钥
    if (adminKey !== CONFIG.ADMIN_KEY) {
      return new Response(JSON.stringify({ error: '无效的管理员密钥' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证URL
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL是必需的' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      new URL(url);
    } catch (e) {
      return new Response(JSON.stringify({ error: '无效的URL格式' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 生成或使用自定义短链接ID
    const shortId = customId || await generateUniqueShortId(env);
    
    // 如果使用自定义ID，检查是否已存在
    if (customId) {
      const existingUrl = await env.SHORTLINK_KV.get(shortId);
      if (existingUrl) {
        return new Response(JSON.stringify({ error: '自定义ID已被使用' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 存储短链接
    const linkData = {
      originalUrl: url,
      createdAt: new Date().toISOString(),
      visits: 0
    };
    
    await env.SHORTLINK_KV.put(shortId, JSON.stringify(linkData));
    
    // 返回成功响应
    return new Response(JSON.stringify({
      shortId,
      shortUrl: generateShortUrl(shortId),
      originalUrl: url
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '处理请求时出错' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 生成唯一的短链接ID
 * @param {Object} env - 环境变量
 * @returns {string} - 生成的唯一短链接ID
 */
async function generateUniqueShortId(env) {
  let shortId;
  let attempts = 0;
  const maxAttempts = 5;
  
  do {
    shortId = generateShortId();
    const existingUrl = await env.SHORTLINK_KV.get(shortId);
    if (!existingUrl) {
      return shortId;
    }
    attempts++;
  } while (attempts < maxAttempts);
  
  // 如果多次尝试后仍无法生成唯一ID，增加长度再试一次
  return generateShortId(CONFIG.SHORT_ID_LENGTH + 1);
}

/**
 * 处理访问短链接的请求
 * @param {string} shortId - 短链接ID
 * @param {Object} env - 环境变量
 * @returns {Response} - 响应对象
 */
async function handleRedirect(shortId, env) {
  // 从KV存储中获取原始URL
  const linkDataStr = await env.SHORTLINK_KV.get(shortId);
  
  if (!linkDataStr) {
    return new Response('短链接不存在', { status: 404 });
  }
  
  try {
    const linkData = JSON.parse(linkDataStr);
    
    // 更新访问计数
    linkData.visits++;
    await env.SHORTLINK_KV.put(shortId, JSON.stringify(linkData));
    
    // 重定向到原始URL
    return Response.redirect(linkData.originalUrl, 302);
  } catch (error) {
    return new Response('处理重定向时出错', { status: 500 });
  }
}

/**
 * 处理获取短链接信息的请求
 * @param {string} shortId - 短链接ID
 * @param {Object} env - 环境变量
 * @returns {Response} - 响应对象
 */
async function handleGetLinkInfo(shortId, env) {
  // 从KV存储中获取链接数据
  const linkDataStr = await env.SHORTLINK_KV.get(shortId);
  
  if (!linkDataStr) {
    return new Response(JSON.stringify({ error: '短链接不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const linkData = JSON.parse(linkDataStr);
    
    // 返回链接信息
    return new Response(JSON.stringify({
      shortId,
      shortUrl: generateShortUrl(shortId),
      originalUrl: linkData.originalUrl,
      createdAt: linkData.createdAt,
      visits: linkData.visits
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '获取链接信息时出错' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 上下文对象
 * @returns {Response} - 响应对象
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 处理API请求
  if (path.startsWith('/api/')) {
    // 创建短链接
    if (path === '/api/create') {
      return handleCreateShortlink(request, env);
    }
    
    // 获取短链接信息
    const infoMatch = path.match(/^\/api\/info\/(.+)$/);
    if (infoMatch) {
      return handleGetLinkInfo(infoMatch[1], env);
    }
    
    // 未知API路径
    return new Response('Not Found', { status: 404 });
  }
  
  // 处理短链接重定向
  const shortId = path.substring(1); // 移除开头的斜杠
  if (shortId) {
    return handleRedirect(shortId, env);
  }
  
  // 首页 - 显示简单的HTML页面
  return new Response(generateHomePage(), {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * 生成首页HTML
 * @returns {string} - HTML内容
 */
function generateHomePage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>shortlink</title>
  <style>
    :root {
      --apple-blue: #0071e3;
      --apple-blue-hover: #0077ed;
      --apple-gray: #f5f5f7;
      --apple-dark: #1d1d1f;
      --apple-border: #d2d2d7;
      --apple-shadow: rgba(0, 0, 0, 0.1);
      --apple-success: #00bd2f;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background-color: #fff;
      color: var(--apple-dark);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    .wrapper {
      max-width: 980px;
      margin: 0 auto;
      padding: 48px 20px;
    }
    
    header {
      text-align: center;
      margin-bottom: 48px;
    }
    
    h1 {
      font-size: 48px;
      font-weight: 600;
      letter-spacing: -0.015em;
      margin-bottom: 12px;
      background: linear-gradient(90deg, #0071e3, #34aadc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .subtitle {
      font-size: 24px;
      font-weight: 400;
      color: #6e6e73;
      max-width: 600px;
      margin: 0 auto;
    }
    
    .card {
      background-color: #fff;
      border-radius: 18px;
      box-shadow: 0 4px 24px var(--apple-shadow);
      padding: 32px;
      margin-bottom: 32px;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    
    .form-group {
      margin-bottom: 24px;
    }
    
    label {
      display: block;
      font-size: 17px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--apple-dark);
    }
    
    input[type="text"], input[type="password"] {
      width: 100%;
      font-size: 17px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--apple-border);
      background-color: var(--apple-gray);
      transition: all 0.2s ease;
    }
    
    input[type="text"]:focus, input[type="password"]:focus {
      outline: none;
      border-color: var(--apple-blue);
      box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.2);
    }
    
    .btn {
      display: inline-block;
      background-color: var(--apple-blue);
      color: white;
      font-size: 17px;
      font-weight: 500;
      padding: 12px 24px;
      border-radius: 980px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      min-width: 160px;
    }
    
    .btn:hover {
      background-color: var(--apple-blue-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    
    .btn:active {
      transform: translateY(0);
    }
    
    .actions {
      display: flex;
      justify-content: center;
      margin-top: 8px;
    }
    
    .error {
      color: #ff3b30;
      font-size: 14px;
      margin-top: 8px;
      padding: 8px 12px;
      background-color: rgba(255, 59, 48, 0.1);
      border-radius: 8px;
      display: none;
    }
    
    .result {
      background-color: #f5f5f7;
      border-radius: 18px;
      padding: 24px;
      margin-top: 32px;
      display: none;
      animation: fadeIn 0.5s ease;
    }
    
    .result-header {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--apple-dark);
    }
    
    .result-item {
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
    }
    
    .result-label {
      font-weight: 500;
      width: 100px;
      flex-shrink: 0;
    }
    
    .result-value {
      flex-grow: 1;
      word-break: break-all;
    }
    
    .result-value a {
      color: var(--apple-blue);
      text-decoration: none;
    }
    
    .result-value a:hover {
      text-decoration: underline;
    }
    
    .copy-btn {
      background-color: transparent;
      border: 1px solid var(--apple-border);
      border-radius: 980px;
      padding: 6px 12px;
      font-size: 14px;
      margin-left: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .copy-btn:hover {
      background-color: var(--apple-gray);
    }
    
    .success-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      background-color: var(--apple-success);
      border-radius: 50%;
      margin-right: 8px;
      display: none;
    }
    
    .success-icon svg {
      width: 12px;
      height: 12px;
      fill: white;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    footer {
      text-align: center;
      margin-top: 48px;
      color: #6e6e73;
      font-size: 14px;
    }
    
    /* 弹窗样式 */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    
    .modal {
      background-color: white;
      border-radius: 18px;
      padding: 32px;
      width: 90%;
      max-width: 480px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      transform: translateY(20px);
      transition: all 0.3s ease;
    }
    
    .modal-overlay.active .modal {
      transform: translateY(0);
    }
    
    .modal-header {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .modal-icon {
      width: 32px;
      height: 32px;
      background-color: var(--apple-success);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
    }
    
    .modal-icon svg {
      width: 18px;
      height: 18px;
      fill: white;
    }
    
    .modal-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--apple-dark);
    }
    
    .modal-content {
      margin-bottom: 24px;
    }
    
    .modal-link {
      background-color: var(--apple-gray);
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 16px;
      margin-bottom: 16px;
      word-break: break-all;
      user-select: all;
      color: var(--apple-blue);
    }
    
    .modal-actions {
      display: flex;
      justify-content: flex-end;
    }
    
    .modal-btn {
      background-color: var(--apple-blue);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 980px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .modal-btn:hover {
      background-color: var(--apple-blue-hover);
    }
    
    @media (max-width: 768px) {
      .wrapper {
        padding: 32px 16px;
      }
      
      h1 {
        font-size: 36px;
      }
      
      .subtitle {
        font-size: 20px;
      }
      
      .card {
        padding: 24px;
      }
      
      .modal {
        padding: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <h1>shortlink</h1>
      <p class="subtitle">简洁、高效的链接缩短服务</p>
    </header>
    
    <div class="card">
      <div class="form-group">
        <label for="url">原始链接</label>
        <input type="text" id="url" placeholder="请输入需要缩短的URL">
      </div>
      
      <div class="form-group">
        <label for="customId">自定义短链接ID（可选）</label>
        <input type="text" id="customId" placeholder="留空将自动生成">
      </div>
      
      <div class="form-group">
        <label for="adminKey">管理员密钥</label>
        <input type="password" id="adminKey" placeholder="请输入管理员密钥">
      </div>
      
      <div class="actions">
        <button id="createBtn" class="btn">生成短链接</button>
      </div>
      
      <div class="error" id="error"></div>
    </div>
    
    <div class="result" id="result">
      <div class="result-header">短链接已生成</div>
      
      <div class="result-item">
        <div class="result-label">短链接</div>
        <div class="result-value">
          <a id="shortUrl" target="_blank"></a>
          <button id="copyShortUrl" class="copy-btn">
            <span class="success-icon" id="copyShortSuccess">
              <svg viewBox="0 0 12 12">
                <path d="M4.5 8.5l-2-2L1.5 7.5 4.5 10.5 10.5 4.5 9.5 3.5z"></path>
              </svg>
            </span>
            复制
          </button>
        </div>
      </div>
      
      <div class="result-item">
        <div class="result-label">原始链接</div>
        <div class="result-value">
          <span id="originalUrl"></span>
          <button id="copyOriginalUrl" class="copy-btn">
            <span class="success-icon" id="copyOriginalSuccess">
              <svg viewBox="0 0 12 12">
                <path d="M4.5 8.5l-2-2L1.5 7.5 4.5 10.5 10.5 4.5 9.5 3.5z"></path>
              </svg>
            </span>
            复制
          </button>
        </div>
      </div>
    </div>
    
    <footer>
      &copy; 2025 shortlink | 基于 Cloudflare Workers
    </footer>
  </div>
  
  <!-- 弹窗 -->
  <div class="modal-overlay" id="successModal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-icon">
          <svg viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path>
          </svg>
        </div>
        <div class="modal-title">短链接已生成并复制到剪贴板</div>
      </div>
      <div class="modal-content">
        <p>您可以直接粘贴使用，或点击下方链接访问：</p>
        <div class="modal-link" id="modalShortUrl"></div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="modalCloseBtn">确定</button>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('createBtn').addEventListener('click', async () => {
      const url = document.getElementById('url').value.trim();
      const customId = document.getElementById('customId').value.trim();
      const adminKey = document.getElementById('adminKey').value.trim();
      const errorEl = document.getElementById('error');
      const resultEl = document.getElementById('result');
      
      // 重置显示
      errorEl.style.display = 'none';
      resultEl.style.display = 'none';
      
      if (!url) {
        errorEl.textContent = '请输入URL';
        errorEl.style.display = 'block';
        return;
      }
      
      if (!adminKey) {
        errorEl.textContent = '请输入管理员密钥';
        errorEl.style.display = 'block';
        return;
      }
      
      // 显示加载状态
      const originalBtnText = document.getElementById('createBtn').textContent;
      document.getElementById('createBtn').textContent = '处理中...';
      document.getElementById('createBtn').disabled = true;
      
      try {
        const response = await fetch('/api/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, customId, adminKey }),
        });
        
        const data = await response.json();
        
        // 恢复按钮状态
        document.getElementById('createBtn').textContent = originalBtnText;
        document.getElementById('createBtn').disabled = false;
        
        if (!response.ok) {
          errorEl.textContent = data.error || '创建短链接失败';
          errorEl.style.display = 'block';
          return;
        }
        
        // 显示结果
        document.getElementById('shortUrl').textContent = data.shortUrl;
        document.getElementById('shortUrl').href = data.shortUrl;
        document.getElementById('originalUrl').textContent = data.originalUrl;
        resultEl.style.display = 'block';
        
        // 滚动到结果区域
        resultEl.scrollIntoView({ behavior: 'smooth' });
        
        // 自动复制短链接到剪贴板
        await copyToClipboard(data.shortUrl);
        
        // 显示弹窗
        document.getElementById('modalShortUrl').textContent = data.shortUrl;
        showModal();
      } catch (error) {
        // 恢复按钮状态
        document.getElementById('createBtn').textContent = originalBtnText;
        document.getElementById('createBtn').disabled = false;
        
        errorEl.textContent = '请求失败，请稍后再试';
        errorEl.style.display = 'block';
      }
    });
    
    // 复制功能
    function setupCopyButton(buttonId, textElementId, successIconId) {
      document.getElementById(buttonId).addEventListener('click', () => {
        const text = document.getElementById(textElementId).textContent;
        copyToClipboard(text).then(() => {
          // 显示成功图标
          document.getElementById(successIconId).style.display = 'inline-flex';
          document.getElementById(buttonId).textContent = '已复制';
          
          // 3秒后恢复
          setTimeout(() => {
            document.getElementById(successIconId).style.display = 'none';
            document.getElementById(buttonId).textContent = '复制';
          }, 3000);
        });
      });
    }
    
    setupCopyButton('copyShortUrl', 'shortUrl', 'copyShortSuccess');
    setupCopyButton('copyOriginalUrl', 'originalUrl', 'copyOriginalSuccess');
    
    // 复制到剪贴板
    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error('无法复制到剪贴板: ', err);
        return false;
      }
    }
    
    // 弹窗控制
    function showModal() {
      const modal = document.getElementById('successModal');
      modal.classList.add('active');
      
      // 阻止滚动
      document.body.style.overflow = 'hidden';
    }
    
    function hideModal() {
      const modal = document.getElementById('successModal');
      modal.classList.remove('active');
      
      // 恢复滚动
      document.body.style.overflow = '';
    }
    
    // 关闭弹窗按钮
    document.getElementById('modalCloseBtn').addEventListener('click', hideModal);
    
    // 点击弹窗外部关闭
    document.getElementById('successModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('successModal')) {
        hideModal();
      }
    });
    
    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('successModal').classList.contains('active')) {
        hideModal();
      }
    });
  </script>
</body>
</html>`;
}

// 导出处理函数
export default {
  fetch: handleRequest
}; 