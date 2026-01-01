module.exports = {
  apps: [
    {
      name: 'pubilo',
      script: './start-server.sh',
      interpreter: 'bash',
      watch: ['src', 'public'],
      ignore_watch: ['node_modules', '.git', 'api'],
    },
  ],
};
