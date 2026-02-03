const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let childProcess = null;
let watchers = [];

function startServer() {
  if (childProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/F', '/T', '/PID', childProcess.pid], { stdio: 'ignore' });
      } else {
        childProcess.kill('SIGTERM');
      }
    } catch (err) {
      // Ignorar erros ao matar processo
    }
  }

  console.log('🚀 Iniciando servidor...');
  childProcess = spawn('npx', ['ts-node', '--transpile-only', 'src/index.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname
  });

  childProcess.on('exit', (code) => {
    if (code !== 0 && code !== null && code !== 1) {
      console.log(`\n⚠️  Servidor encerrado com código ${code}`);
    }
  });
}

function watchDirectory(dir) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        watchDirectory(filePath);
      } else if (file.endsWith('.ts') || file.endsWith('.json')) {
        try {
          const watcher = fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
            if (curr.mtime !== prev.mtime) {
              console.log(`\n📝 Arquivo alterado: ${path.relative(__dirname, filePath)}`);
              console.log('🔄 Reiniciando servidor...\n');
              startServer();
            }
          });
          watchers.push({ watcher, filePath });
        } catch (err) {
          // Ignorar erros de watch
        }
      }
    });
  } catch (err) {
    // Ignorar erros
  }
}

console.log('👀 Observando mudanças em src/...\n');
console.log('⚠️  Nota: Se a porta 5000 estiver em uso, feche o processo manualmente ou altere a porta no arquivo .env\n');
watchDirectory(path.join(__dirname, 'src'));
startServer();

// Limpar ao encerrar
process.on('SIGINT', () => {
  console.log('\n\n🛑 Encerrando...');
  watchers.forEach(({ watcher }) => {
    try {
      fs.unwatchFile(watcher);
    } catch (err) {
      // Ignorar
    }
  });
  if (childProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/F', '/T', '/PID', childProcess.pid], { stdio: 'ignore' });
      } else {
        childProcess.kill('SIGTERM');
      }
    } catch (err) {
      // Ignorar
    }
  }
  process.exit(0);
});
