// PM2 (Windows, Linux o macOS):  npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save
// En Linux, para que arranque con el equipo: pm2 startup   (y ejecuta el comando que te muestra)
// En Windows: npm i -g pm2-installer  o usa servicio-windows.bat
module.exports = {
  apps: [
    {
      name: 'streamcrm',
      script: 'src/server.js',
      node_args: '--disable-warning=ExperimentalWarning',
      cwd: __dirname,
      instances: 1, // un solo proceso: el scheduler y SQLite viven aquí
      autorestart: true,
      max_restarts: 50,
      env: { NODE_ENV: 'production' },
    },
  ],
};
