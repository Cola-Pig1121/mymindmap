const fs = require('fs');
const path = require('path');

// 复制start.js中的处理函数
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

// 生成静态mind.html文件 - 静态版本，包含文档导航
function generateStaticMindHTML(docsStructure) {
    const navItems = generateNavStructure(docsStructure);
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>思维导图导航器</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            overflow: hidden;
        }

        .container {
            display: flex;
            height: 100vh;
        }

        .sidebar {
            width: 300px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
            overflow-y: auto;
            box-shadow: 2px 0 20px rgba(0, 0, 0, 0.1);
        }

        .sidebar-header {
            padding: 20px;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .nav-list {
            padding: 10px 0;
        }

        .nav-item {
            display: block;
            padding: 12px 20px;
            text-decoration: none;
            color: #333;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            transition: all 0.3s ease;
            position: relative;
            cursor: pointer;
        }

        .nav-item:hover {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            transform: translateX(5px);
        }

        .nav-item.active {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            font-weight: bold;
        }

        .nav-item.folder {
            font-size: 16px;
            font-weight: bold;
            background: rgba(79, 172, 254, 0.1);
            border-left: 4px solid #4facfe;
            cursor: default;
        }

        .nav-item.file {
            font-size: 14px;
            padding-left: 40px;
            background: rgba(255, 255, 255, 0.5);
        }

        .nav-item.folder::before {
            content: "📁";
            margin-right: 8px;
        }

        .nav-item.file::before {
            content: "📄";
            margin-right: 8px;
        }

        .main-content {
            flex: 1;
            position: relative;
            background: white;
        }

        .mindmap-container {
            width: 100%;
            height: 100%;
            border: none;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
            font-size: 18px;
        }

        .empty-state .icon {
            font-size: 64px;
            margin-bottom: 20px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="sidebar-header">
                📚 文档导航
            </div>
            <div class="nav-list" id="nav-list">
                ${navItems}
            </div>
        </div>
        
        <div class="main-content">
            <div class="empty-state" id="empty-state">
                <div class="icon">🗺️</div>
                <div>选择一个文档查看思维导图</div>
            </div>
            <iframe class="mindmap-container" id="mindmap-frame" style="display: none;"></iframe>
        </div>
    </div>

    <script>
        let currentFilePath = '';

        // 加载思维导图
        function loadMindmap(filePath) {
            const mindmapFrame = document.getElementById('mindmap-frame');
            const emptyState = document.getElementById('empty-state');
            
            if (filePath) {
                currentFilePath = filePath;
                mindmapFrame.src = filePath;
                mindmapFrame.style.display = 'block';
                emptyState.style.display = 'none';
                
                // 更新活动导航项
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                });
                document.querySelector('[data-file="' + filePath + '"]').classList.add('active');
            } else {
                mindmapFrame.style.display = 'none';
                emptyState.style.display = 'flex';
            }
        }

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            // 为导航项添加点击事件
            document.querySelectorAll('.nav-item.file').forEach(item => {
                item.addEventListener('click', function() {
                    const filePath = this.getAttribute('data-file');
                    loadMindmap(filePath);
                });
            });
        });
    </script>
</body>
</html>`;
}

// 生成导航结构HTML
function generateNavStructure(docsStructure) {
    let html = '';
    
    function generateItems(items, level = 0) {
        let result = '';
        items.forEach(item => {
            if (item.type === 'folder') {
                result += `<div class="nav-item folder" style="padding-left: ${level * 20}px;">${item.name}</div>`;
                if (item.children && item.children.length > 0) {
                    result += generateItems(item.children, level + 1);
                }
            } else {
                const filePath = item.path.replace('docs/', '').replace('.md', '.html').replace(/\\/g, '/');
                result += `<div class="nav-item file" style="padding-left: ${(level + 1) * 20}px;" data-file="${filePath}">${item.name.replace('.html', '')}</div>`;
            }
        });
        return result;
    }
    
    html = generateItems(docsStructure);
    return html;
}

// 生成思维导图HTML - 与start.js完全一致
function generateMindmapHTML(content, fileName) {
    const processedContent = renderLatex(content);
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>思维导图 - ${fileName}</title>
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
                            } else {
                                // 备用方案：使用markmap的fit方法
                                console.log('使用备用方案：markmap fit');
                                markmapInstance.fit();
                            }
                        } catch (e) {
                            console.error('跳转过程中发生错误:', e);
                            // 最终备用方案
                            if (markmapInstance) {
                                markmapInstance.fit();
                            }
                        }
                    }, 100);
                } else {
                    console.warn('未找到匹配的节点:', sectionId);
                    // 如果找不到匹配的节点，也调用fit
                    if (markmapInstance) {
                        markmapInstance.fit();
                    }
                }
            } catch (e) {
                console.error('跳转功能发生错误:', e);
                if (markmapInstance) {
                    markmapInstance.fit();
                }
            }
        }

        // 渲染LaTeX
        function renderLatexElements() {
            // 渲染块级公式
            document.querySelectorAll('.katex-block').forEach(el => {
                const latex = el.getAttribute('data-latex');
                if (latex && window.katex) {
                    try {
                        katex.render(latex, el, { displayMode: true });
                    } catch (e) {
                        console.error('LaTeX渲染错误:', e);
                    }
                }
            });
            
            // 渲染行内公式
            document.querySelectorAll('.katex-inline').forEach(el => {
                const latex = el.getAttribute('data-latex');
                if (latex && window.katex) {
                    try {
                        katex.render(latex, el, { displayMode: false });
                    } catch (e) {
                        console.error('LaTeX渲染错误:', e);
                    }
                }
            });
        }

        // 页面加载完成后渲染LaTeX
        window.addEventListener('load', () => {
            setTimeout(() => {
                initialize();
                renderLatexElements();
            }, 1000);
        });
    </script>
</body>
</html>`;
}

// 扫描并处理docs目录
function processDocs() {
    const docsPath = path.join(__dirname, 'docs');
    const outputPath = path.join(__dirname, 'dist');
    
    // 创建输出目录
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }
    
    function processDirectory(dirPath, relativePath = '') {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        entries.forEach(entry => {
            const fullPath = path.join(dirPath, entry.name);
            const relativeFilePath = path.join(relativePath, entry.name);
            
            if (entry.isDirectory()) {
                // 创建对应目录
                const outputDir = path.join(outputPath, relativeFilePath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                // 递归处理子目录
                processDirectory(fullPath, relativeFilePath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // 处理markdown文件
                const content = fs.readFileSync(fullPath, 'utf-8');
                const fileName = path.basename(entry.name, '.md');
                const html = generateMindmapHTML(content, fileName);
                
                // 生成HTML文件名
                const htmlFileName = entry.name.replace('.md', '.html');
                const outputFilePath = path.join(outputPath, relativePath, htmlFileName);
                
                // 确保输出目录存在
                const outputDir = path.dirname(outputFilePath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                fs.writeFileSync(outputFilePath, html);
                console.log(`已生成: ${path.join(relativePath, htmlFileName)}`);
            }
        });
    }
    
    if (fs.existsSync(docsPath)) {
        console.log('开始处理docs文件夹...');
        processDirectory(docsPath);
        console.log('docs处理完成！');
    } else {
        console.log('docs文件夹不存在，跳过处理');
    }
}

// 扫描并构建文档结构
function buildDocsStructure(docsPath) {
    const structure = [];
    
    function scanDirectory(dirPath, basePath = '') {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = [];
        
        items.forEach(item => {
            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.join(basePath, item.name);
            
            if (item.isDirectory()) {
                const folder = {
                    type: 'folder',
                    name: item.name,
                    children: scanDirectory(fullPath, relativePath)
                };
                result.push(folder);
            } else if (item.isFile() && item.name.endsWith('.md')) {
                result.push({
                    type: 'file',
                    name: item.name,
                    path: relativePath
                });
            }
        });
        
        return result.sort((a, b) => {
            if (a.type === 'folder' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
    }
    
    if (fs.existsSync(docsPath)) {
        return scanDirectory(docsPath);
    }
    return [];
}

// 主函数
async function main() {
    console.log('开始处理文档...');
    
    // 确保dist目录存在
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }
    
    // 处理文档
    await processDocs();
    
    // 构建文档结构并生成静态mind.html
    console.log('构建文档结构...');
    const docsStructure = buildDocsStructure(path.join(__dirname, 'docs'));
    
    console.log('生成静态mind.html...');
    const mindHTML = generateStaticMindHTML(docsStructure);
    fs.writeFileSync(path.join(__dirname, 'dist', 'mind.html'), mindHTML);
    
    console.log('文档处理完成！');
}

// 如果直接运行
if (require.main === module) {
    main();
}

module.exports = { processDocs, generateStaticMindHTML };