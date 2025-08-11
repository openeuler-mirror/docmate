const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

/**
 * esbuild配置 - 用于打包VS Code扩展
 * 解决monorepo中workspace依赖的运行时解析问题
 */

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

/**
 * 复制UI资源文件到dist目录
 */
function copyUIAssets() {
  const sourceDir = path.join(__dirname, 'packages/ui/dist');
  const targetDir = path.join(__dirname, 'dist/ui');

  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 复制文件（注意：Vite 输出的 CSS 文件名为 ui.css）
  const files = ['index.js', 'index.js.map', 'ui.css'];
  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`📁 Copied: ${file}`);
    } else {
      console.warn(`⚠️  File not found: ${sourcePath}`);
    }
  });
}

async function buildExtension() {
  try {
    const buildOptions = {
      // 入口文件：扩展的主文件
      entryPoints: ['packages/extension/src/extension.ts'],

      // 开启bundle模式：将所有依赖打包到一个文件中
      bundle: true,

      // 输出配置
      outfile: 'dist/extension.js',

      // 平台和目标配置
      platform: 'node',
      target: 'node18', // VS Code 1.85+ 使用 Node.js 18
      format: 'cjs', // CommonJS格式，VS Code扩展要求

      // 外部依赖：这些模块由运行时环境提供，不需要打包
      external: [
        'vscode', // VS Code API
        'electron', // Electron相关模块
      ],

      // 源码映射：便于调试
      sourcemap: isProduction ? false : 'inline',

      // 代码压缩
      minify: isProduction,

      // 保留类名和函数名（便于调试）
      keepNames: !isProduction,

      // 定义全局变量
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      },

      // 路径解析配置
      resolveExtensions: ['.ts', '.js', '.json'],

      // 日志级别
      logLevel: 'info',

      // 元信息
      metafile: !isProduction, // 生成构建分析文件

      // Node.js环境配置
      mainFields: ['main', 'module'],
      conditions: ['node'],
    };

    let result;
    if (isWatch) {
      // 监听模式
      const context = await require('esbuild').context(buildOptions);
      await context.watch();
      console.log('👀 Watching for changes...');
      return;
    } else {
      // 一次性构建
      result = await build(buildOptions);
    }

    if (result.metafile && !isProduction) {
      // 输出构建分析
      console.log('\n📊 Build Analysis:');
      console.log(`📦 Bundle size: ${(result.metafile.outputs['dist/extension.js']?.bytes / 1024).toFixed(2)} KB`);
      
      // 分析依赖
      const inputs = Object.keys(result.metafile.inputs);
      const workspaceInputs = inputs.filter(input => input.includes('packages/'));
      console.log(`🔗 Workspace packages bundled: ${workspaceInputs.length}`);
      workspaceInputs.forEach(input => {
        console.log(`   - ${input}`);
      });
    }

    console.log('✅ Extension bundled successfully!');

    // 复制UI资源
    console.log('\n📁 Copying UI assets...');
    copyUIAssets();
    console.log('✅ UI assets copied successfully!');

  } catch (error) {
    console.error('❌ Extension build failed:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本，则执行构建
if (require.main === module) {
  buildExtension();
}

module.exports = { buildExtension };
