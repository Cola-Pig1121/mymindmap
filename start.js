const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const app = express();
// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// 全局变量
let docsStructure = [];
const ADMIN_PASSWORD = '@ColaPig5418';

// 后端LaTeX渲染函数
function renderLatex(content) {
    // 块级公式 $$...$$ (先处理块级，避免与行内冲突)
    content = content.replace(/\$\$([^$]+?)\$\$/g, function(match, latex) {
        // 清理LaTeX内容，移除多余的转义和格式
        const cleanLatex = latex.trim()
            .replace(/\\displaystyle/g, '')
            .replace(/\\\\/g, '\\')
            .replace(/\s+/g, ' ');
        return `<div class="katex-block" data-latex="${cleanLatex}"></div>`;
    });
    
    // 行内公式 $...$
    content = content.replace(/\$([^$\n]+?)\$/g, function(match, latex) {
        // 清理LaTeX内容
        const cleanLatex = latex.trim()
            .replace(/\\displaystyle/g, '')
            .replace(/\\\\/g, '\\')
            .replace(/\s+/g, ' ');
        return `<span class="katex-inline" data-latex="${cleanLatex}"></span>`;
    });
    
    return content;
}

// 扫描文档目录
function scanDocsDirectory() {
    const docsPath = path.join(__dirname, 'docs');
    
    if (!fs.existsSync(docsPath)) {
        fs.mkdirSync(docsPath, { recursive: true });
        return [];
    }
    
    function scanDirectory(dirPath, relativePath = '') {
        const items = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        entries.forEach(entry => {
            const fullPath = path.join(dirPath, entry.name);
            const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/');
            
            if (entry.isDirectory()) {
                const children = scanDirectory(fullPath, relativeFilePath);
                items.push({
                    type: 'folder',
                    name: entry.name,
                    path: relativeFilePath,
                    children: children
                });
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                items.push({
                    type: 'file',
                    name: entry.name,
                    path: path.join('docs', relativeFilePath).replace(/\\/g, '/')
                });
            }
        });
        
        return items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });
    }
    
    return scanDirectory(docsPath);
}

// 解析Markdown内容生成目录
function parseTOC(markdownContent) {
    const lines = markdownContent.replace(/\r\n/g, '\n').split('\n');
    const toc = [];
    
    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            const title = match[2].trim();
            
            // 生成与markmap兼容的ID
            const id = title
                .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase()
                .replace(/^-+|-+$/g, '');
            
            toc.push({
                level: level,
                title: title,
                id: id,
                line: index + 1,
                rawTitle: title
            });
        }
    });
    
    return toc;
}

// 生成目录HTML
function generateTOCHTML(toc, filePath) {
    if (toc.length === 0) {
        return '<div style="padding: 20px; color: #666; text-align: center;">该文档暂无目录</div>';
    }
    
    let html = '<div class="toc-container">';
    toc.forEach(item => {
        const indent = (item.level - 1) * 20;
        // 使用原始标题作为跳转参数，确保能准确匹配markmap节点
        // 注意：这里不进行HTML转义，直接使用原始标题文本
        const safeTitle = item.title.replace(/'/g, "\\'").replace(/\n/g, '\\n');
        html += `<div class="toc-item" style="padding-left: ${indent}px;" onclick="jumpToMarkmapSection('${safeTitle}')">
            <span class="toc-level">${'#'.repeat(item.level)}</span>
            <span class="toc-title">${item.title}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

// 生成导航HTML
function generateNavHTML(items) {
    let html = '';
    
    items.forEach(item => {
        if (item.type === 'folder') {
            html += `<div class="nav-item folder">${item.name}</div>`;
            if (item.children && item.children.length > 0) {
                html += generateNavHTML(item.children);
            }
        } else {
            html += `<div class="nav-item file" onclick="loadMindmap('${item.path}')">${item.name}</div>`;
        }
    });
    
    return html;
}

// 初始化文档结构
function initializeDocsStructure() {
    docsStructure = scanDocsDirectory();
    console.log('文档结构已更新:', docsStructure.length, '个项目');
}

// 路由

// 主页 - 返回mind.html文件
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mind.html'));
});

// API: 获取导航HTML
app.get('/api/nav', (req, res) => {
    const navHTML = generateNavHTML(docsStructure);
    res.send(navHTML);
});

// 思维导图页面
app.get('/mindmap', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).send('缺少文件路径参数');
    }
    
    try {
        const fullPath = path.join(__dirname, filePath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).send('文件不存在');
        }
        
        const content = fs.readFileSync(fullPath, 'utf-8');
        const processedContent = renderLatex(content);
        
        // 返回思维导图页面 - 按照官方示例格式
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>思维导图 - ${path.basename(filePath)}</title>
    <style>
        svg.markmap {
            width: 100%;
            height: 100vh;
        }
        .katex-inline {
            display: inline;
        }
        .katex-block {
            display: block;
            text-align: center;
            margin: 10px 0;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18"></script>
</head>
<body>
    <div class="markmap">
        <script type="text/template">
---
markmap:
  maxWidth: 300
  colorFreezeLevel: 2
  nodeMinHeight: 16
  spacingVertical: 5
---

${processedContent}
        </script>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script>
        let markmapInstance = null;
        
        // 等待markmap渲染完成
        function waitForMarkmap() {
            return new Promise((resolve) => {
                const checkMarkmap = () => {
                    const markmapEl = document.querySelector('.markmap svg');
                    if (markmapEl && window.markmap && window.markmap.Markmap) {
                        resolve();
                    } else {
                        setTimeout(checkMarkmap, 100);
                    }
                };
                checkMarkmap();
            });
        }

        // 初始化
        async function initialize() {
            await waitForMarkmap();
            
            // 获取markmap实例
            const markmapEl = document.querySelector('.markmap');
            if (markmapEl && markmapEl._markmap) {
                markmapInstance = markmapEl._markmap;
            }
            
            // 通知父页面加载完成
            if (window.parent !== window) {
                window.parent.postMessage({ action: 'markmapLoaded' }, '*');
            }
            
            // 渲染LaTeX
            renderLatexElements();
        }

        // 跳转到指定节点
        function jumpToSection(sectionId, retryCount = 0) {
            try {
                const maxRetries = 10;
                
                // 等待markmap实例准备就绪
                if (!markmapInstance || !markmapInstance.root) {
                    if (retryCount < maxRetries) {
                        console.warn('Markmap instance not ready, retry ' + (retryCount + 1) + '...');
                        setTimeout(() => jumpToSection(sectionId, retryCount + 1), 300);
                        return;
                    } else {
                        console.error('Markmap instance initialization failed, cannot jump');
                        return;
                    }
                }
                
                console.log('开始跳转到章节:', sectionId);
                
                // 查找匹配的节点 - 支持多种匹配方式
                let targetNode = null;
                
                function findNode(node) {
                    if (node.content) {
                        // 获取节点文本内容
                        const nodeText = typeof node.content === 'string' ? node.content : 
                                       (node.content.text || '').toString();
                        
                        // 清理文本（移除HTML标签）
                        const cleanNodeTitle = nodeText.replace(/<[^>]*>/g, '').trim();
                        const cleanSection = sectionId.trim();
                        
                        // 直接匹配
                        if (cleanNodeTitle === cleanSection) {
                            targetNode = node;
                            return true;
                        }
                        
                        // 处理HTML实体
                        const decodedTitle = cleanNodeTitle.replace(/&amp;/g, '&')
                                                         .replace(/&lt;/g, '<')
                                                         .replace(/&gt;/g, '>')
                                                         .replace(/&quot;/g, '"')
                                                         .replace(/&#39;/g, "'");
                        const decodedSection = cleanSection.replace(/&amp;/g, '&')
                                                         .replace(/&lt;/g, '<')
                                                         .replace(/&gt;/g, '>')
                                                         .replace(/&quot;/g, '"')
                                                         .replace(/&#39;/g, "'");
                        
                        if (decodedTitle === decodedSection) {
                            targetNode = node;
                            return true;
                        }
                        
                        // 模糊匹配（忽略大小写和空格）
                        const normalizedNode = decodedTitle.toLowerCase().replace(/\s+/g, '');
                        const normalizedSection = decodedSection.toLowerCase().replace(/\s+/g, '');
                        if (normalizedNode === normalizedSection) {
                            targetNode = node;
                            return true;
                        }
                        
                        // 部分匹配
                        if (decodedTitle.includes(decodedSection) || decodedSection.includes(decodedTitle)) {
                            targetNode = node;
                            return true;
                        }
                    }
                    
                    if (node.children) {
                        for (let child of node.children) {
                            if (findNode(child)) return true;
                        }
                    }
                    
                    return false;
                }
                
                findNode(markmapInstance.root);
                
                if (targetNode) {
                    console.log('找到目标节点:', sectionId, targetNode);
                    
                    // 确保所有父节点都展开
                    markmapInstance.expandTo(targetNode);
                    
                    // 使用setTimeout确保DOM更新完成
                    setTimeout(() => {
                        try {
                            // 获取SVG元素和节点元素
                            const svg = document.querySelector('.markmap svg');
                            const nodeElement = document.querySelector('[data-path="' + targetNode.path + '"]');
                            
                            if (nodeElement) {
                                console.log('找到DOM节点:', nodeElement);
                                
                                // 获取SVG的视口尺寸
                                const svgRect = svg.getBoundingClientRect();
                                const svgWidth = svgRect.width;
                                const svgHeight = svgRect.height;
                                
                                // 获取节点在SVG坐标系中的位置
                                const transformAttr = nodeElement.getAttribute('transform');
                                const transformMatch = transformAttr.match(/translate\(([^,]+),([^)]+)\)/);
                                
                                if (transformMatch) {
                                    const nodeX = parseFloat(transformMatch[1]);
                                    const nodeY = parseFloat(transformMatch[2]);
                                    
                                    // 获取当前缩放级别（从SVG的g元素）
                                    const gElement = svg.querySelector('g');
                                    const gTransform = gElement.getAttribute('transform') || '';
                                    const scaleMatch = gTransform.match(/scale\(([^)]+)\)/);
                                    const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
                                    
                                    // 计算新的平移值，使节点居中
                                    const targetScale = 1.5; // 聚焦时的缩放级别
                                    const newX = (svgWidth / 2) - (nodeX * targetScale);
                                    const newY = (svgHeight / 2) - (nodeY * targetScale);
                                    
                                    // 应用平滑过渡动画
                                    gElement.style.transition = 'transform 0.5s ease-in-out';
                                    gElement.style.transform = 'translate(' + newX + 'px, ' + newY + 'px) scale(' + targetScale + ')';
                                    
                                    console.log('节点居中成功:', 'X=' + newX, 'Y=' + newY, 'Scale=' + targetScale);
                                } else {
                                    // 备用方案：使用markmap的fit方法
                                    console.log('使用备用方案：markmap fit');
                                    markmapInstance.fit();
                                }
                                
                                // 高亮节点
                                const nodeContent = nodeElement.querySelector('.markmap-foreign');
                                if (nodeContent) {
                                    nodeContent.style.outline = '3px solid #007acc';
                                    nodeContent.style.outlineOffset = '2px';
                                    nodeContent.style.borderRadius = '4px';
                                    nodeContent.style.transition = 'outline 0.3s ease';
                                    
                                    // 3秒后移除高亮
                                    setTimeout(() => {
                                        nodeContent.style.outline = '';
                                    }, 3000);
                                }
                                
                                console.log('节点聚焦成功:', sectionId);
                            } else {
                                console.warn('未找到对应的DOM节点:', targetNode.path, '尝试使用markmap API');
                                // 尝试使用markmap内置方法
                                markmapInstance.fit();
                            }
                        } catch (e) {
                            console.error('节点聚焦失败:', e);
                            // 备用方案：使用markmap的fit方法
                            markmapInstance.fit();
                        }
                    }, 600);
                } else {
                    console.warn('未找到匹配的节点:', sectionId);
                    // 尝试部分匹配
                    const possibleNodes = [];
                    function collectNodes(node) {
                        if (node.content) {
                            const nodeText = typeof node.content === 'string' ? node.content : 
                                           (node.content.text || '').toString();
                            const cleanText = nodeText.replace(/<[^>]*>/g, '').trim();
                            if (cleanText.toLowerCase().includes(sectionId.toLowerCase())) {
                                possibleNodes.push(cleanText);
                            }
                        }
                        if (node.children) {
                            node.children.forEach(collectNodes);
                        }
                    }
                    collectNodes(markmapInstance.root);
                    console.log('可能的匹配节点:', possibleNodes);
                }
            } catch (error) {
                console.error('跳转失败:', error);
            }
        }

        // 监听来自父页面的消息
        window.addEventListener('message', function(event) {
            if (event.data && event.data.action === 'jumpToSection') {
                jumpToSection(event.data.sectionId);
            }
        });

        // 渲染LaTeX元素
        function renderLatexElements() {
            try {
                // 渲染行内公式
                document.querySelectorAll('.katex-inline').forEach(element => {
                    const latex = element.getAttribute('data-latex');
                    if (latex && window.katex) {
                        try {
                            katex.render(latex, element, {displayMode: false});
                        } catch (e) {
                            console.error('KaTeX行内渲染失败:', e, '公式:', latex);
                            element.textContent = '$' + latex + '$';
                        }
                    }
                });
                
                // 渲染块级公式
                document.querySelectorAll('.katex-block').forEach(element => {
                    const latex = element.getAttribute('data-latex');
                    if (latex && window.katex) {
                        try {
                            katex.render(latex, element, {displayMode: true});
                        } catch (e) {
                            console.error('KaTeX块级渲染失败:', e, '公式:', latex);
                            element.textContent = '$$' + latex + '$$';
                        }
                    }
                });
            } catch (error) {
                console.error('LaTeX渲染失败:', error);
            }
        }

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', initialize);
    </script>
</body>
</html>`;
        
        res.send(html);
    } catch (error) {
        console.error('读取文件失败:', error);
        res.status(500).send('读取文件失败: ' + error.message);
    }
});

// API: 获取思维导图内容
app.get('/api/mindmap-content', (req, res) => {
    const filePath = decodeURIComponent(req.query.file || '');
    
    if (!filePath) {
        return res.status(400).json({ error: '缺少文件路径参数' });
    }
    
    try {
        const fullPath = path.join(__dirname, filePath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        const content = fs.readFileSync(fullPath, 'utf-8');
        const processedContent = renderLatex(content);
        const toc = parseTOC(content);
        
        // 返回处理后的markdown内容和目录
        res.json({ 
            content: `---
markmap:
  maxWidth: 300
  colorFreezeLevel: 2
  nodeMinHeight: 16
  spacingVertical: 5
---

${processedContent}`,
            toc: toc,
            filePath: filePath
        });
    } catch (error) {
        console.error('读取文件失败:', error);
        res.status(500).json({ error: '读取文件失败: ' + error.message });
    }
});

// API: 获取目录
app.get('/api/toc', (req, res) => {
    const filePath = decodeURIComponent(req.query.file || '');
    
    if (!filePath) {
        return res.status(400).json({ error: '缺少文件路径参数' });
    }
    
    try {
        const fullPath = path.join(__dirname, filePath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        const content = fs.readFileSync(fullPath, 'utf-8');
        const toc = parseTOC(content);
        const tocHTML = generateTOCHTML(toc, filePath);
        
        res.json({ 
            toc: toc,
            html: tocHTML
        });
    } catch (error) {
        console.error('生成目录失败:', error);
        res.status(500).json({ error: '生成目录失败: ' + error.message });
    }
});

// 文件管理页面（简单表单）
app.get('/create-file', (req, res) => {
    res.send(`
        <html>
        <head><title>新建文件</title><meta charset="UTF-8"></head>
        <body style="font-family: Microsoft YaHei; padding: 20px;">
            <h2>新建Markdown文件</h2>
            <form method="POST" action="/api/create">
                <input type="hidden" name="type" value="file">
                <p>管理员密码: <input type="password" name="password" required></p>
                <p>文件名: <input type="text" name="name" placeholder="例: 新文件.md" required></p>
                <p>保存路径: <input type="text" name="path" placeholder="例: docs/物理/" value="docs/"></p>
                <p>文件内容:</p>
                <textarea name="content" rows="10" cols="50" placeholder="输入Markdown内容..."># 新文件

这是一个新的Markdown文件。

## 示例内容

- 列表项1
- 列表项2

### 数学公式示例

行内公式: $E=mc^2$

块级公式:
$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$
</textarea>
                <br><br>
                <button type="submit">创建文件</button>
                <button type="button" onclick="window.close()">取消</button>
            </form>
        </body>
        </html>
    `);
});

app.get('/create-folder', (req, res) => {
    res.send(`
        <html>
        <head><title>新建文件夹</title><meta charset="UTF-8"></head>
        <body style="font-family: Microsoft YaHei; padding: 20px;">
            <h2>新建文件夹</h2>
            <form method="POST" action="/api/create">
                <input type="hidden" name="type" value="folder">
                <p>管理员密码: <input type="password" name="password" required></p>
                <p>文件夹名: <input type="text" name="name" placeholder="例: 新文件夹" required></p>
                <p>保存路径: <input type="text" name="path" placeholder="例: docs/" value="docs/"></p>
                <br>
                <button type="submit">创建文件夹</button>
                <button type="button" onclick="window.close()">取消</button>
            </form>
        </body>
        </html>
    `);
});

// API路由
app.post('/api/create', (req, res) => {
    const { type, password, name, path: targetPath, content } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).send('密码错误');
    }
    
    try {
        const fullPath = path.join(__dirname, targetPath, name);
        
        if (type === 'folder') {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content || '# 新文件\n\n这是一个新的Markdown文件。');
        }
        
        initializeDocsStructure();
        res.send(`
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="font-family: Microsoft YaHei; padding: 20px;">
                <h2>创建成功！</h2>
                <p>${type === 'folder' ? '文件夹' : '文件'} "${name}" 已创建。</p>
                <button onclick="window.opener.location.reload(); window.close();">关闭并刷新</button>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('创建失败:', error);
        res.status(500).send('创建失败: ' + error.message);
    }
});

// 监控文件变化
const watcher = chokidar.watch('docs', {
    ignored: /[\/\\]\./,
    persistent: true
});

watcher.on('all', (event, path) => {
    console.log(`文件变化: ${event} ${path}`);
    initializeDocsStructure();
});

// 初始化并启动服务器
initializeDocsStructure();

const server = app.listen(0, () => {
    const actualPort = server.address().port;
    console.log(`服务器已启动，正在监听 http://localhost:${actualPort}`);
    console.log('正在监控 "docs" 目录...');
});

process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    watcher.close();
    server.close();
    process.exit(0);
});